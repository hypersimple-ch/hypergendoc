import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { limits } from "../packages/config/src/index.js";

const socketPath =
  process.env.RENDERER_SOCKET ?? "/run/hypergendoc/renderer.sock";
const style = {
  logoObjectId: null,
  bodyFont: "Inter",
  headingFont: "Inter",
  bodySizePt: 10,
  headingScale: 1.4,
  italicStyle: "italic",
  colors: {
    text: "#17201c",
    heading: "#17201c",
    primary: "#a33b20",
    accent: "#276f62",
    muted: "#767b76",
  },
  page: {
    size: "A4",
    marginTopMm: 20,
    marginRightMm: 18,
    marginBottomMm: 20,
    marginLeftMm: 18,
  },
  header: {
    enabled: false,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: false,
  },
  footer: {
    enabled: true,
    leftText: "HyperGenDoc topology test",
    centerText: "",
    rightText: "",
    showPageNumber: true,
  },
};

type RendererResponse = {
  requestId: string;
  ok: boolean;
  pdfBase64?: string;
  pdfHash?: string;
  error?: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function request(body: string): Promise<RendererResponse> {
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();
    const socket = createConnection(socketPath);
    let response = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Renderer topology request timed out"));
    }, limits.renderTimeoutMs + 10_000);
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.end(
        `${JSON.stringify({
          protocol: "hypergendoc-render-v1",
          requestId,
          body,
          style,
        })}\n`,
      );
    });
    socket.on("data", (chunk: string) => {
      response += chunk;
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.once("close", () => {
      clearTimeout(timeout);
      try {
        const parsed = JSON.parse(response.trim()) as RendererResponse;
        assert(parsed.requestId === requestId, "Renderer mixed request IDs");
        resolve(parsed);
      } catch (error) {
        reject(
          new Error("Renderer returned an invalid bounded response", {
            cause: error,
          }),
        );
      }
    });
  });
}

async function main(): Promise<void> {
  const valid = await request("\\section{Valid}\nIsolated renderer output.");
  assert(
    valid.ok && valid.pdfBase64 && valid.pdfHash,
    `Valid render failed: ${JSON.stringify(valid)}`,
  );
  assert(
    Buffer.from(valid.pdfBase64, "base64").subarray(0, 5).toString() ===
      "%PDF-",
    "Renderer output is not a PDF",
  );

  const hostile = [
    "\\input{/etc/passwd}",
    "\\include{../secret}",
    "\\openin1=/proc/self/environ",
    "\\write18{wget https://example.invalid}",
    "\\immediate\\write18{id}",
    "\\catcode`\\@=11",
    "\\csname input\\endcsname{/etc/hostname}",
    "\\newcommand{\\escape}{unsafe}",
    "\\href{file:///etc/passwd}{read}",
    "\\documentclass{article}\\begin{document}escape\\end{document}",
    `${"{".repeat(70)}deep${"}".repeat(70)}`,
  ];
  const rejected = await Promise.all(hostile.map((body) => request(body)));
  for (const [index, response] of rejected.entries()) {
    assert(
      !response.ok && response.error === "render_rejected",
      `Hostile corpus item ${index} was not rejected`,
    );
    assert(
      !JSON.stringify(response).includes(hostile[index]!),
      "Renderer response leaked hostile input",
    );
  }

  const pageExhaustion = await request(
    `\\section{Page limit}\n${"bounded\\newpage\n".repeat(101)}`,
  );
  assert(
    !pageExhaustion.ok && pageExhaustion.error === "render_failed",
    "Renderer page limit was not enforced",
  );

  const concurrent = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      request(`\\section{Concurrent ${index}}\nJob ${index} boundary.`),
    ),
  );
  assert(
    concurrent.every((response) => response.ok),
    `Concurrent render failed: ${JSON.stringify(
      concurrent.map(({ requestId, ok, error }) => ({ requestId, ok, error })),
    )}`,
  );
  assert(
    new Set(concurrent.map((response) => response.pdfHash)).size ===
      concurrent.length,
    "Concurrent jobs did not produce isolated outputs",
  );

  process.stdout.write(
    `${JSON.stringify({
      status: "ok",
      validRenders: concurrent.length + 1,
      hostileInputsRejected: hostile.length,
      resourceLimitInputsRejected: 1,
      socketPath,
    })}\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Renderer topology test failed"}\n`,
  );
  process.exitCode = 1;
});
