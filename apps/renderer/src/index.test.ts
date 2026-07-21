import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { renderDocumentHtml, sourceHash } from "@hypergendoc/document";
import {
  ChromiumPdfRenderer,
  RENDERER_PROTOCOL,
  type ChromiumLauncher,
  type PdfRenderer,
  type RendererRequest,
  render,
  startRenderer,
} from "./index.js";

const style = {
  logoObjectId: null,
  bodyFont: "Inter",
  headingFont: "Inter",
  bodySizePt: 11,
  headingScale: 1.4,
  italicStyle: "italic",
  colors: {
    text: "#111111",
    heading: "#222222",
    primary: "#123456",
    accent: "#654321",
    muted: "#777777",
  },
  page: {
    size: "A4",
    marginTopMm: 20,
    marginRightMm: 20,
    marginBottomMm: 20,
    marginLeftMm: 20,
  },
  header: {
    enabled: false,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: false,
  },
  footer: {
    enabled: false,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: false,
  },
} as const;
const request: RendererRequest = {
  protocol: RENDERER_PROTOCOL,
  requestId: "11111111-1111-4111-8111-111111111111",
  format: "markdown",
  body: "# Hello",
  style,
};

async function pdf(pages = 1) {
  const document = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) document.addPage();
  return Buffer.from(await document.save());
}

const renderer = (result: Buffer): PdfRenderer => ({
  render: () => Promise.resolve(result),
});

function requestSocket(
  socketPath: string,
  value: unknown,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let response = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.end(`${JSON.stringify(value)}\n`));
    socket.on("data", (chunk: string) => (response += chunk));
    socket.on("end", () => {
      try {
        const parsed = JSON.parse(response) as unknown;
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        )
          throw new Error("invalid response");
        resolve(parsed as Record<string, unknown>);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("invalid response"));
      }
    });
    socket.on("error", reject);
    socket.on("close", () => {
      if (!response) reject(new Error("socket closed without response"));
    });
  });
}

describe("renderer worker", () => {
  it.each(["markdown", "html"] as const)(
    "renders %s using the shared deterministic source",
    async (format) => {
      const body = format === "markdown" ? "# Hello" : "<h1>Hello</h1>";
      let received = "";
      const result = await render(
        { ...request, format, body },
        {
          render: async (source) => {
            received = source;
            return pdf();
          },
        },
      );
      expect(result).toMatchObject({
        ok: true,
        sourceHash: sourceHash(renderDocumentHtml(body, format, style)),
      });
      expect(received).toBe(renderDocumentHtml(body, format, style));
    },
  );

  it("carries resolved assets into the canonical source", async () => {
    const bytes = Buffer.from("font");
    const fontId = "11111111-1111-4111-8111-111111111111";
    const assets = {
      logo: null,
      fonts: [
        {
          id: fontId,
          contentType: "font/ttf",
          byteSize: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          base64: bytes.toString("base64"),
        },
      ],
    };
    let received = "";
    const result = await render(
      {
        ...request,
        style: {
          ...style,
          assetVersion: 1,
          bodyFont: fontId,
        },
        assets,
      },
      { render: async (source) => ((received = source), pdf()) },
    );
    expect(result).toMatchObject({ ok: true });
    expect(received).toContain("data:font/ttf;base64,Zm9udA==");
  });

  it("sanitizes malicious markup before Chromium and does not fetch URLs", async () => {
    let received = "";
    const result = await render(
      {
        ...request,
        format: "html",
        body: '<img src="https://evil.invalid/x"><script>fetch("https://evil.invalid")</script><a href="javascript:alert(1)">safe</a>',
      },
      {
        render: async (source) => {
          received = source;
          return pdf();
        },
      },
    );
    expect(result).toMatchObject({ ok: true });
    expect(received).not.toContain("evil.invalid");
    expect(received).not.toContain("script");
    expect(received).not.toContain("javascript:");
  });

  it("hashes the exact PDF bytes", async () => {
    const bytes = await pdf();
    const result = await render(request, renderer(bytes));
    expect(result).toMatchObject({
      ok: true,
      pdfHash: createHash("sha256").update(bytes).digest("hex"),
    });
  });

  it("returns detail-free errors for invalid input, browser failures, timeouts, invalid PDFs, and limits", async () => {
    const failing: PdfRenderer = {
      render: () =>
        Promise.reject(new Error("browser secret https://evil.invalid")),
    };
    expect(
      await render({ ...request, body: "x".repeat(256 * 1024 + 1) }, failing),
    ).toMatchObject({ error: "render_rejected" });
    expect(await render(request, failing)).toEqual(
      expect.objectContaining({ error: "render_failed" }),
    );
    expect(
      await render(request, {
        render: () =>
          Promise.reject(
            Object.assign(new Error("timeout"), { code: "timeout" }),
          ),
      }),
    ).toEqual(expect.objectContaining({ error: "render_timeout" }));
    expect(await render(request, renderer(Buffer.from("not-pdf")))).toEqual(
      expect.objectContaining({ error: "render_failed" }),
    );
    expect(await render(request, renderer(await pdf(101)))).toEqual(
      expect.objectContaining({ error: "render_output_limit" }),
    );
    const oversized = Buffer.alloc(25 * 1024 * 1024 + 1);
    oversized.write("%PDF-");
    expect(await render(request, renderer(oversized))).toEqual(
      expect.objectContaining({ error: "render_output_limit" }),
    );
  }, 35_000);

  it("installs request blocking, uses print PDF options, and kills the fresh browser server", async () => {
    const calls: string[] = [];
    let abort: (() => Promise<void>) | undefined;
    const page = {
      route: (
        _: string,
        handler: (route: { abort(): Promise<void> }) => Promise<void>,
      ) => {
        calls.push("route");
        abort = () =>
          handler({
            abort: () => {
              calls.push("abort");
              return Promise.resolve();
            },
          });
        return Promise.resolve();
      },
      emulateMedia: () => {
        calls.push("print");
        return Promise.resolve();
      },
      setContent: () => {
        calls.push("content");
        return Promise.resolve();
      },
      evaluate: () => {
        calls.push("fonts");
        return Promise.resolve();
      },
      pdf: (options: unknown) => {
        calls.push(JSON.stringify(options));
        return pdf();
      },
    };
    const browser = {
      newContext: () =>
        Promise.resolve({ newPage: () => Promise.resolve(page) }),
    } as never;
    const launcher: ChromiumLauncher = {
      launchServer: (options) => {
        calls.push(JSON.stringify(options));
        return Promise.resolve({
          wsEndpoint: () => "ws://renderer.test",
          kill: () => {
            calls.push("server-kill");
            return Promise.resolve();
          },
        } as never);
      },
      connect: (endpoint) => {
        calls.push(endpoint);
        return Promise.resolve(browser);
      },
    };
    const output = await new ChromiumPdfRenderer(launcher).render(
      "<p>ok</p>",
      1000,
    );
    expect(output.subarray(0, 5).toString()).toBe("%PDF-");
    expect(calls).toContain(
      JSON.stringify({
        headless: true,
        chromiumSandbox: true,
        timeout: 1000,
      }),
    );
    expect(calls).toContain("ws://renderer.test");
    expect(calls).toContain("route");
    expect(calls.indexOf("content")).toBeLessThan(calls.indexOf("fonts"));
    expect(calls.indexOf("fonts")).toBeLessThan(
      calls.indexOf(
        JSON.stringify({ printBackground: true, preferCSSPageSize: true }),
      ),
    );
    expect(calls.at(-1)).toBe("server-kill");
    await abort!();
    expect(calls).toContain("abort");
  });

  it("force-kills the browser server when the wall-clock timeout wins", async () => {
    const calls: string[] = [];
    const launcher: ChromiumLauncher = {
      launchServer: () =>
        Promise.resolve({
          wsEndpoint: () => "ws://renderer.test",
          kill: () => {
            calls.push("server-kill");
            return Promise.resolve();
          },
        } as never),
      connect: () =>
        Promise.resolve({
          newContext: () =>
            Promise.resolve({
              newPage: () =>
                Promise.resolve({
                  route: () => Promise.resolve(),
                  emulateMedia: () => Promise.resolve(),
                  setContent: () => Promise.resolve(),
                  evaluate: () => Promise.resolve(),
                  pdf: () => new Promise<Buffer>(() => undefined),
                }),
            }),
        } as never),
    };
    await expect(
      new ChromiumPdfRenderer(launcher).render("<p>slow</p>", 10),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(calls).toEqual(["server-kill"]);
  });

  it("bounds frames and allows only one queued job", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hypergendoc-renderer-"));
    const socketPath = join(directory, "renderer.sock");
    let release: (() => void) | undefined;
    let started!: () => void;
    const startedRendering = new Promise<void>(
      (resolve) => (started = resolve),
    );
    const server = await startRenderer(socketPath, {
      render: async () =>
        new Promise<Buffer>((resolve) => {
          release = () => void pdf().then(resolve);
          started();
        }),
    });
    try {
      const first = requestSocket(socketPath, request);
      await startedRendering;
      const second = requestSocket(socketPath, {
        ...request,
        requestId: randomUUID(),
      });
      const third = await requestSocket(socketPath, {
        ...request,
        requestId: randomUUID(),
      });
      expect(third).toMatchObject({ ok: false, error: "render_busy" });
      release!();
      await expect(first).resolves.toMatchObject({ ok: true });
      release!();
      await expect(second).resolves.toMatchObject({ ok: true });
      await expect(
        requestSocket(
          socketPath,
          `${"x".repeat(256 * 1024 + Math.ceil((30 * 1024 * 1024) / 3) * 4 + 16 * 1024 + 1)}`,
        ),
      ).rejects.toBeDefined();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);
});
