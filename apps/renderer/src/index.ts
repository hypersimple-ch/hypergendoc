import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, unlink } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { chromium, type Browser, type BrowserServer } from "playwright-core";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { limits } from "@hypergendoc/config";
import {
  ResolvedStyleAssetsSchema,
  StyleDefinitionSchema,
} from "@hypergendoc/contracts";
import {
  DOCUMENT_MAX_PAGES,
  DocumentInputError,
  renderDocumentHtml,
  sourceHash,
} from "@hypergendoc/document";

export const RENDERER_PROTOCOL = "hypergendoc-render-v2";
const MAX_FRAME_BYTES =
  limits.documentBodyBytes +
  Math.ceil(limits.renderAssetBytes / 3) * 4 +
  16 * 1024;
const PDF_HEADER = Buffer.from("%PDF-");

const RendererRequestSchema = z
  .object({
    protocol: z.literal(RENDERER_PROTOCOL),
    requestId: z.string().uuid(),
    format: z.enum(["markdown", "html"]),
    body: z
      .string()
      .min(1)
      .refine(
        (body) => Buffer.byteLength(body, "utf8") <= limits.documentBodyBytes,
      ),
    style: StyleDefinitionSchema,
    assets: ResolvedStyleAssetsSchema.optional().default({
      logo: null,
      fonts: [],
    }),
  })
  .strict();
export type RendererRequest = z.input<typeof RendererRequestSchema>;

export const RendererResponseSchema = z
  .object({
    protocol: z.literal(RENDERER_PROTOCOL),
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
        "render_busy",
      ])
      .optional(),
  })
  .strict();
export type RendererResponse = z.infer<typeof RendererResponseSchema>;

export interface PdfRenderer {
  render(source: string, timeoutMs: number): Promise<Buffer>;
}

export interface ChromiumLauncher {
  launchServer(options: {
    headless: true;
    chromiumSandbox: true;
    timeout: number;
  }): Promise<BrowserServer>;
  connect(wsEndpoint: string): Promise<Browser>;
}

class RenderError extends Error {
  constructor(
    public readonly code: "unavailable" | "timeout" | "output_limit",
  ) {
    super(code);
  }
}

const digest = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
const killQuietly = async (server: BrowserServer | undefined) => {
  try {
    await server?.kill();
  } catch {
    // Cleanup failures must not disclose browser details or mask the safe result.
  }
};

/** A fresh Chromium browser/context is created for every untrusted document. */
export class ChromiumPdfRenderer implements PdfRenderer {
  constructor(private readonly launcher: ChromiumLauncher = chromium) {}

  async render(source: string, timeoutMs: number): Promise<Buffer> {
    let browserServer: BrowserServer | undefined;
    let cancelled = false;
    let timer: NodeJS.Timeout | undefined;
    const job = (async () => {
      try {
        browserServer = await this.launcher.launchServer({
          headless: true,
          chromiumSandbox: true,
          timeout: timeoutMs,
        });
      } catch {
        throw new RenderError("unavailable");
      }
      if (cancelled) {
        await killQuietly(browserServer);
        throw new RenderError("timeout");
      }
      try {
        const browser = await this.launcher.connect(browserServer.wsEndpoint());
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.route("**/*", async (route) => route.abort());
        await page.emulateMedia({ media: "print" });
        await page.setContent(source, { waitUntil: "load" });
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        return Buffer.from(
          await page.pdf({ printBackground: true, preferCSSPageSize: true }),
        );
      } catch {
        throw new Error("chromium render failed");
      }
    })();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new RenderError("timeout")), timeoutMs);
    });
    try {
      return await Promise.race([job, timeout]);
    } finally {
      cancelled = true;
      if (timer) clearTimeout(timer);
      await killQuietly(browserServer);
    }
  }
}

async function validatePdf(pdf: Buffer): Promise<void> {
  if (pdf.length > limits.renderedArtifactBytes)
    throw new RenderError("output_limit");
  if (pdf.length < PDF_HEADER.length || !pdf.subarray(0, 5).equals(PDF_HEADER))
    throw new Error("invalid pdf");
  try {
    if ((await PDFDocument.load(pdf)).getPageCount() > DOCUMENT_MAX_PAGES)
      throw new RenderError("output_limit");
  } catch (error) {
    if (error instanceof RenderError) throw error;
    throw new Error("invalid pdf", { cause: error });
  }
}

const requestIdFrom = (request: unknown): string => {
  if (
    typeof request === "object" &&
    request !== null &&
    "requestId" in request &&
    typeof request.requestId === "string"
  )
    return request.requestId;
  return randomUUID();
};

export async function render(
  request: unknown,
  pdfRenderer: PdfRenderer = new ChromiumPdfRenderer(),
): Promise<RendererResponse> {
  const parsed = RendererRequestSchema.safeParse(request);
  if (!parsed.success)
    return {
      protocol: RENDERER_PROTOCOL,
      requestId: requestIdFrom(request),
      ok: false,
      error: "render_rejected",
    };
  try {
    const source = renderDocumentHtml(
      parsed.data.body,
      parsed.data.format,
      parsed.data.style,
      parsed.data.assets,
    );
    const pdf = await pdfRenderer.render(source, limits.renderTimeoutMs);
    await validatePdf(pdf);
    return {
      protocol: RENDERER_PROTOCOL,
      requestId: parsed.data.requestId,
      ok: true,
      sourceHash: sourceHash(source),
      pdfHash: digest(pdf),
      pdfBase64: pdf.toString("base64"),
    };
  } catch (error) {
    const code =
      error instanceof DocumentInputError
        ? "render_rejected"
        : (error as { code?: string }).code === "unavailable"
          ? "dependency_unavailable"
          : (error as { code?: string }).code === "timeout"
            ? "render_timeout"
            : (error as { code?: string }).code === "output_limit"
              ? "render_output_limit"
              : "render_failed";
    return {
      protocol: RENDERER_PROTOCOL,
      requestId: parsed.data.requestId,
      ok: false,
      error: code,
    };
  }
}

function send(socket: Socket, response: RendererResponse): void {
  if (!socket.destroyed && !socket.writableEnded)
    socket.end(`${JSON.stringify(response)}\n`);
}

function handleSocket(
  socket: Socket,
  renderJob: (request: unknown) => Promise<RendererResponse>,
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
        send(socket, await renderJob(JSON.parse(frame.slice(0, -1))));
      } catch {
        send(socket, {
          protocol: RENDERER_PROTOCOL,
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
  pdfRenderer: PdfRenderer = new ChromiumPdfRenderer(),
): Promise<Server> {
  try {
    if ((await lstat(socketPath)).isSocket()) await unlink(socketPath);
    else throw new Error("socket path is not a socket");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let queuedOrRunning = 0;
  let queue = Promise.resolve();
  const renderJob = (request: unknown): Promise<RendererResponse> => {
    if (queuedOrRunning >= 2)
      return Promise.resolve({
        protocol: RENDERER_PROTOCOL,
        requestId: requestIdFrom(request),
        ok: false,
        error: "render_busy" as const,
      });
    queuedOrRunning += 1;
    const result = queue.then(() => render(request, pdfRenderer));
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      queuedOrRunning -= 1;
    });
  };
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    socket.on("error", () => undefined);
    handleSocket(socket, renderJob);
  });
  server.once("close", () => void unlink(socketPath).catch(() => undefined));
  await new Promise<void>((resolve, reject) =>
    server.once("error", reject).listen(socketPath, resolve),
  );
  await chmod(socketPath, 0o660);
  return server;
}

if (
  process.argv[1]?.endsWith("index.js") ||
  process.argv[1]?.endsWith("index.cjs") ||
  process.argv[1]?.endsWith("index.ts")
) {
  startRenderer()
    .then((server) => {
      const shutdown = () => server.close(() => undefined);
      process.once("SIGTERM", shutdown);
      process.once("SIGINT", shutdown);
    })
    .catch(() => {
      process.exitCode = 1;
    });
}
