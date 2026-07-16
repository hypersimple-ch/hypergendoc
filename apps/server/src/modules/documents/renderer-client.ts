import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { limits } from "@hypergendoc/config";
import type { StyleDefinition } from "@hypergendoc/contracts";
import { AppError } from "../../platform/errors.js";

const protocol = "hypergendoc-render-v1" as const;
const maxFrameBytes = limits.latexBodyBytes + 16 * 1024;

export interface RenderRequest {
  readonly body: string;
  readonly style: StyleDefinition;
}
export interface RenderResult {
  readonly ok: boolean;
  readonly sourceHash?: string;
  readonly pdfHash?: string;
  readonly pdf?: Uint8Array;
  readonly error?:
    "render_rejected" | "render_failed" | "dependency_unavailable";
  readonly rendererVersion: string;
}
export interface Renderer {
  render(request: RenderRequest): Promise<RenderResult>;
}

type WireResponse = Readonly<{
  protocol: typeof protocol;
  requestId: string;
  ok: boolean;
  sourceHash?: string;
  pdfHash?: string;
  pdfBase64?: string;
  error?:
    | "render_rejected"
    | "render_failed"
    | "dependency_unavailable"
    | "render_timeout"
    | "render_output_limit";
}>;

function renderError(error: WireResponse["error"]): RenderResult["error"] {
  if (error === "render_rejected") return error;
  if (error === "dependency_unavailable" || error === "render_timeout")
    return "dependency_unavailable";
  return "render_failed";
}

/** Bounded newline-delimited client for the private renderer Unix socket. */
export function createUnixSocketRenderer(
  socketPath: string,
  timeoutMs = limits.renderTimeoutMs + 5_000,
  rendererVersion = "hypergendoc-render-v1",
): Renderer {
  return {
    render(request) {
      return new Promise<RenderResult>((resolve) => {
        const requestId = randomUUID();
        const frame = `${JSON.stringify({ protocol, requestId, ...request })}\n`;
        if (Buffer.byteLength(frame, "utf8") > maxFrameBytes)
          return resolve({
            ok: false,
            error: "render_rejected",
            rendererVersion,
          });
        let settled = false;
        let response = "";
        const finish = (result: RenderResult) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            socket.destroy();
            resolve(result);
          }
        };
        const socket = connect(socketPath);
        const timer = setTimeout(
          () =>
            finish({
              ok: false,
              error: "dependency_unavailable",
              rendererVersion,
            }),
          timeoutMs,
        );
        socket.setEncoding("utf8");
        socket.once("error", () =>
          finish({
            ok: false,
            error: "dependency_unavailable",
            rendererVersion,
          }),
        );
        socket.once("connect", () => socket.end(frame));
        socket.on("data", (chunk: string) => {
          if (
            Buffer.byteLength(response, "utf8") +
              Buffer.byteLength(chunk, "utf8") >
            maxFrameBytes
          )
            return finish({
              ok: false,
              error: "render_failed",
              rendererVersion,
            });
          response += chunk;
          const newline = response.indexOf("\n");
          // Socket chunks are arbitrary: wait for one complete frame, but reject
          // multiple frames or trailing data from this single-request protocol.
          if (newline === -1) return;
          if (newline !== response.length - 1)
            return finish({
              ok: false,
              error: "render_failed",
              rendererVersion,
            });
          try {
            const parsed = JSON.parse(
              response.slice(0, newline),
            ) as WireResponse;
            if (
              parsed.protocol !== protocol ||
              parsed.requestId !== requestId ||
              typeof parsed.ok !== "boolean"
            )
              return finish({
                ok: false,
                error: "render_failed",
                rendererVersion,
              });
            if (!parsed.ok)
              return finish({
                ok: false,
                error: renderError(parsed.error) ?? "render_failed",
                rendererVersion,
              });
            if (!parsed.sourceHash || !parsed.pdfHash || !parsed.pdfBase64)
              return finish({
                ok: false,
                error: "render_failed",
                rendererVersion,
              });
            const pdf = Buffer.from(parsed.pdfBase64, "base64");
            if (
              !pdf.byteLength ||
              pdf.byteLength > limits.renderedArtifactBytes ||
              !pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))
            )
              return finish({
                ok: false,
                error: "render_failed",
                rendererVersion,
              });
            return finish({
              ok: true,
              sourceHash: parsed.sourceHash,
              pdfHash: parsed.pdfHash,
              pdf,
              rendererVersion,
            });
          } catch {
            return finish({
              ok: false,
              error: "render_failed",
              rendererVersion,
            });
          }
        });
      });
    },
  };
}

export function rendererFailure(result: RenderResult): AppError {
  const code = result.error ?? "render_failed";
  return new AppError(code, code === "dependency_unavailable" ? 503 : 422);
}
