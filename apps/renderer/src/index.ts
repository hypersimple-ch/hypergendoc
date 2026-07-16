import { createHash, randomUUID } from "node:crypto";
import {
  access,
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import { limits } from "@hypergendoc/config";
import { StyleDefinitionSchema } from "@hypergendoc/contracts";
import {
  LatexSubsetError,
  normalizeLatexBody,
  sourceHash,
  wrapLatexDocument,
} from "@hypergendoc/latex";

// JSON framing has bounded protocol/style overhead; PDFs are never accepted inbound.
const MAX_FRAME_BYTES = limits.latexBodyBytes + 16 * 1024;
const TECTONIC_CACHE_DIR =
  process.env.RENDERER_TECTONIC_CACHE_DIR ?? "/opt/tectonic-cache";
const TECTONIC_BUNDLE_MARKER = ".hypergendoc-bundle-ready";
const RendererRequestSchema = z
  .object({
    protocol: z.literal("hypergendoc-render-v1"),
    requestId: z.string().uuid(),
    body: z.string().min(1).max(limits.latexBodyBytes),
    style: StyleDefinitionSchema,
  })
  .strict();
export type RendererRequest = z.infer<typeof RendererRequestSchema>;
export const RendererResponseSchema = z
  .object({
    protocol: z.literal("hypergendoc-render-v1"),
    requestId: z.string().uuid(),
    ok: z.boolean(),
    sourceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    pdfHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    pdfBase64: z.string().optional(),
    error: z
      .enum([
        "render_rejected",
        "render_failed",
        "dependency_unavailable",
        "render_timeout",
        "render_output_limit",
      ])
      .optional(),
  })
  .strict();
export type RendererResponse = z.infer<typeof RendererResponseSchema>;

export interface Compiler {
  compile(
    sourcePath: string,
    workspace: string,
    timeoutMs: number,
  ): Promise<void>;
}

const digest = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
export const tectonicEnvironment = (workspace: string, cacheDir: string) => ({
  PATH: "/usr/local/bin:/usr/bin:/bin",
  HOME: workspace,
  TMPDIR: workspace,
  TECTONIC_CACHE_DIR: cacheDir,
  SOURCE_DATE_EPOCH: "0",
  LANG: "C.UTF-8",
});

export const tectonicArgs = (sourcePath: string, workspace: string) => [
  "-X",
  "compile",
  "--only-cached",
  "--untrusted",
  "--outdir",
  workspace,
  sourcePath,
];

/** Spawn without a shell and terminate the entire detached process group. */
export class TexCompiler implements Compiler {
  constructor(
    private readonly binary = process.env.RENDERER_TEX_BINARY ??
      "/usr/local/bin/tectonic",
  ) {}

  async compile(
    sourcePath: string,
    workspace: string,
    timeoutMs: number,
  ): Promise<void> {
    const cacheDir = TECTONIC_CACHE_DIR;
    try {
      await access(this.binary);
      const bundle = await stat(join(cacheDir, TECTONIC_BUNDLE_MARKER));
      if (!bundle.isFile()) throw new Error("bundle marker is not a file");
    } catch {
      throw Object.assign(new Error("tectonic bundle unavailable"), {
        code: "unavailable",
      });
    }
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, tectonicArgs(sourcePath, workspace), {
        cwd: workspace,
        env: tectonicEnvironment(workspace, cacheDir),
        shell: false,
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      });
      let done = false;
      const finish = (error?: Error) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          clearInterval(outputWatch);
          if (error) reject(error);
          else resolve();
        }
      };
      const kill = () => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      };
      const timer = setTimeout(() => {
        kill();
        finish(Object.assign(new Error("timeout"), { code: "timeout" }));
      }, timeoutMs);
      const outputWatch = setInterval(() => {
        stat(join(workspace, "document.pdf"))
          .then((info) => {
            if (info.size > limits.renderedArtifactBytes) {
              kill();
              finish(
                Object.assign(new Error("output limit"), {
                  code: "output_limit",
                }),
              );
            }
          })
          .catch(() => undefined);
      }, 100);
      child.once("error", (error: NodeJS.ErrnoException) =>
        finish(
          Object.assign(error, {
            code:
              error.code === "ENOENT" || error.code === "EACCES"
                ? "unavailable"
                : "failed",
          }),
        ),
      );
      child.once("exit", (code) =>
        finish(
          code === 0
            ? undefined
            : Object.assign(new Error("compiler failed"), { code: "failed" }),
        ),
      );
    });
  }
}

export async function render(
  request: RendererRequest,
  compiler: Compiler = new TexCompiler(),
): Promise<RendererResponse> {
  const parsed = RendererRequestSchema.safeParse(request);
  if (!parsed.success)
    return {
      protocol: "hypergendoc-render-v1",
      requestId: request?.requestId ?? randomUUID(),
      ok: false,
      error: "render_rejected",
    };
  let workspace: string | undefined;
  try {
    const body = normalizeLatexBody(parsed.data.body);
    const source = wrapLatexDocument(body, parsed.data.style);
    const hash = sourceHash(source);
    workspace = await mkdtemp(join(tmpdir(), "hypergendoc-render-"));
    const sourcePath = join(workspace, "document.tex");
    await writeFile(sourcePath, source, { encoding: "utf8", mode: 0o600 });
    await compiler.compile(sourcePath, workspace, limits.renderTimeoutMs);
    const pdfPath = join(workspace, "document.pdf");
    const info = await stat(pdfPath);
    if (
      !info.isFile() ||
      info.size < 1 ||
      info.size > limits.renderedArtifactBytes
    ) {
      return {
        protocol: "hypergendoc-render-v1",
        requestId: parsed.data.requestId,
        ok: false,
        error: "render_output_limit",
      };
    }
    const pdf = await readFile(pdfPath);
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-")))
      throw new Error("not a pdf");
    return {
      protocol: "hypergendoc-render-v1",
      requestId: parsed.data.requestId,
      ok: true,
      sourceHash: hash,
      pdfHash: digest(pdf),
      pdfBase64: pdf.toString("base64"),
    };
  } catch (error) {
    const code =
      error instanceof LatexSubsetError
        ? "render_rejected"
        : (error as { code?: string }).code === "unavailable"
          ? "dependency_unavailable"
          : (error as { code?: string }).code === "timeout"
            ? "render_timeout"
            : (error as { code?: string }).code === "output_limit"
              ? "render_output_limit"
              : "render_failed";
    return {
      protocol: "hypergendoc-render-v1",
      requestId: parsed.data.requestId,
      ok: false,
      error: code,
    };
  } finally {
    if (workspace) await rm(workspace, { recursive: true, force: true });
  }
}

function send(socket: Socket, response: RendererResponse): void {
  if (!socket.destroyed && !socket.writableEnded)
    socket.end(`${JSON.stringify(response)}\n`);
}
function handleSocket(
  socket: Socket,
  renderJob: (request: RendererRequest) => Promise<RendererResponse>,
): void {
  let frame = "";
  socket.setEncoding("utf8");
  socket.setTimeout(limits.renderTimeoutMs + 5_000, () => socket.destroy());
  socket.on("data", (chunk: string) => {
    if (
      Buffer.byteLength(frame, "utf8") + Buffer.byteLength(chunk, "utf8") >
      MAX_FRAME_BYTES
    )
      return socket.destroy();
    frame += chunk;
    if (frame.includes("\n") && frame.indexOf("\n") !== frame.length - 1)
      socket.destroy();
  });
  socket.once("end", () => {
    void (async () => {
      try {
        if (!frame.endsWith("\n")) return socket.destroy();
        const value: unknown = JSON.parse(frame.slice(0, -1));
        send(socket, await renderJob(value as RendererRequest));
      } catch {
        send(socket, {
          protocol: "hypergendoc-render-v1",
          requestId: randomUUID(),
          ok: false,
          error: "render_rejected",
        });
      }
    })();
  });
}

export async function startRenderer(
  socketPath = process.env.RENDERER_SOCKET ?? "/run/hypergendoc/renderer.sock",
  compiler: Compiler = new TexCompiler(),
): Promise<Server> {
  try {
    if ((await lstat(socketPath)).isSocket()) await unlink(socketPath);
    else throw new Error("socket path is not a socket");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // One compiler process at a time fits the MVP container's single CPU and
  // bounded memory; queued sockets remain isolated and preserve backpressure.
  let renderQueue = Promise.resolve();
  const renderJob = (request: RendererRequest) => {
    const result = renderQueue.then(() => render(request, compiler));
    renderQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    // A client may disconnect while compilation is in flight; it must not crash the daemon.
    socket.on("error", () => undefined);
    handleSocket(socket, renderJob);
  });
  await new Promise<void>((resolve, reject) =>
    server.once("error", reject).listen(socketPath, resolve),
  );
  await chmod(socketPath, 0o660);
  return server;
}

if (
  process.argv[1]?.endsWith("index.js") ||
  process.argv[1]?.endsWith("index.ts")
) {
  startRenderer().catch(() => (process.exitCode = 1));
}
