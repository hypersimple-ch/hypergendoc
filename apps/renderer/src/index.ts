import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, unlink } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { chromium, type Browser, type BrowserServer } from "playwright-core";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { limits } from "@hypergendoc/config";
import {
  ResolvedStyleAssetsSchema,
  ResolvedTemplateAssetsSchema,
  StyleDefinitionSchema,
  TemplateDataSchema,
  TemplateDefinitionSchema,
} from "@hypergendoc/contracts";
import {
  DOCUMENT_MAX_PAGES,
  DocumentInputError,
  renderDocumentHtml,
  renderTemplateDocumentHtml,
  sourceHash,
} from "@hypergendoc/document";

/** Parse the shared render deadline used by Chromium, IPC, and the server client. */
export function loadRenderTimeout(value: string | undefined): number {
  const parsed = Number(value?.trim() || "30000");
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 30_000)
    throw new Error(
      "RENDER_TIMEOUT_MS must be an integer between 1000 and 30000",
    );
  return parsed;
}

export const RENDERER_PROTOCOL = "hypergendoc-render-v2";
const MAX_FRAME_BYTES =
  3 * limits.documentBodyBytes +
  Math.ceil(limits.renderAssetBytes / 3) * 4 +
  768 * 1024;
const PDF_HEADER = Buffer.from("%PDF-");

const RendererRequestBaseSchema = z.object({
  protocol: z.literal(RENDERER_PROTOCOL),
  requestId: z.string().uuid(),
  style: StyleDefinitionSchema,
  assets: ResolvedStyleAssetsSchema.optional().default({
    logo: null,
    fonts: [],
  }),
});
const RendererRequestSchema = z.discriminatedUnion("format", [
  RendererRequestBaseSchema.extend({
    format: z.enum(["markdown", "html"]),
    body: z
      .string()
      .min(1)
      .refine(
        (body) => Buffer.byteLength(body, "utf8") <= limits.documentBodyBytes,
      ),
  }).strict(),
  RendererRequestBaseSchema.extend({
    format: z.literal("template"),
    template: TemplateDefinitionSchema,
    data: TemplateDataSchema,
    templateAssets: ResolvedTemplateAssetsSchema.optional().default({
      images: [],
    }),
    locale: z.string().min(2).max(35).optional(),
  }).strict(),
]);
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
          const pages = [
            ...document.querySelectorAll<HTMLElement>(".template-page"),
          ];
          const millimeterPx = 96 / 25.4;
          type PageSegment = Readonly<{
            top: number;
            bottom: number;
            pageOffset: number;
            pages: number;
          }>;
          const pagination = new Map<
            HTMLElement,
            Readonly<{
              start: number;
              top: number;
              contentHeightPx: number;
              segments: readonly PageSegment[];
            }>
          >();
          let nextPage = 1;
          for (const templatePage of pages) {
            const startOn = templatePage.dataset.pageStart ?? "any";
            if (startOn === "recto" && nextPage % 2 === 0) nextPage += 1;
            if (startOn === "verso" && nextPage % 2 === 1) nextPage += 1;
            const contentHeightPx =
              Number(templatePage.dataset.pageContentMm) * millimeterPx;
            const rect = templatePage.getBoundingClientRect();
            const breakOffsets = [
              ...templatePage.querySelectorAll<HTMLElement>(
                ".template-page-break",
              ),
            ]
              .map((pageBreak) =>
                Math.max(
                  0,
                  Math.min(
                    rect.height,
                    pageBreak.getBoundingClientRect().bottom - rect.top,
                  ),
                ),
              )
              .sort((left, right) => left - right);
            const boundaries = [0, ...breakOffsets, rect.height];
            const segments: PageSegment[] = [];
            let pageOffset = 0;
            for (let index = 0; index < boundaries.length - 1; index += 1) {
              const top = boundaries[index] ?? 0;
              const bottom = boundaries[index + 1] ?? top;
              const pagesForSegment = Number.isFinite(contentHeightPx)
                ? Math.max(1, Math.ceil((bottom - top) / contentHeightPx))
                : 1;
              segments.push({
                top,
                bottom,
                pageOffset,
                pages: pagesForSegment,
              });
              pageOffset += pagesForSegment;
            }
            pagination.set(templatePage, {
              start: nextPage,
              top: rect.top,
              contentHeightPx,
              segments,
            });
            nextPage += Math.max(1, pageOffset);
          }
          for (const link of document.querySelectorAll<HTMLAnchorElement>(
            ".template-toc a[href^='#']",
          )) {
            const id = link.getAttribute("href")?.slice(1);
            const target = id ? document.getElementById(id) : null;
            const templatePage = target?.closest<HTMLElement>(".template-page");
            const pageInfo = templatePage
              ? pagination.get(templatePage)
              : undefined;
            let pageNumber = pageInfo?.start ?? 0;
            if (target && pageInfo) {
              const targetOffset = Math.max(
                0,
                target.getBoundingClientRect().top - pageInfo.top,
              );
              const segment =
                pageInfo.segments.find(
                  (candidate) =>
                    targetOffset >= candidate.top &&
                    targetOffset <= candidate.bottom,
                ) ?? pageInfo.segments.at(-1);
              if (segment)
                pageNumber +=
                  segment.pageOffset +
                  Math.min(
                    segment.pages - 1,
                    Math.max(
                      0,
                      Math.floor(
                        (targetOffset - segment.top) / pageInfo.contentHeightPx,
                      ),
                    ),
                  );
            }
            const output =
              link.querySelector<HTMLElement>(".template-toc-page");
            if (output && pageNumber > 0)
              output.textContent = String(pageNumber);
          }
        });
        return Buffer.from(
          await page.pdf({
            printBackground: true,
            preferCSSPageSize: true,
            tagged: true,
            outline: true,
          }),
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
  timeoutMs = loadRenderTimeout(process.env.RENDER_TIMEOUT_MS),
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
    const source =
      parsed.data.format === "template"
        ? renderTemplateDocumentHtml({
            definition: parsed.data.template,
            data: parsed.data.data,
            style: parsed.data.style,
            styleAssets: parsed.data.assets,
            templateAssets: parsed.data.templateAssets,
            ...(parsed.data.locale ? { locale: parsed.data.locale } : {}),
          })
        : renderDocumentHtml(
            parsed.data.body,
            parsed.data.format,
            parsed.data.style,
            parsed.data.assets,
          );
    const pdf = await pdfRenderer.render(source, timeoutMs);
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
  timeoutMs: number,
): void {
  const chunks: string[] = [];
  let frameBytes = 0;
  let completeFrame = false;
  socket.setEncoding("utf8");
  socket.setTimeout(timeoutMs + 5_000, () => socket.destroy());
  socket.on("data", (chunk: string) => {
    frameBytes += Buffer.byteLength(chunk, "utf8");
    if (
      frameBytes > MAX_FRAME_BYTES ||
      completeFrame ||
      (chunk.includes("\n") && chunk.indexOf("\n") !== chunk.length - 1)
    )
      return socket.destroy();
    chunks.push(chunk);
    completeFrame = chunk.endsWith("\n");
  });
  socket.once("end", () => {
    void (async () => {
      try {
        const frame = chunks.join("");
        if (!completeFrame || !frame.endsWith("\n")) return socket.destroy();
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
  timeoutMs = loadRenderTimeout(process.env.RENDER_TIMEOUT_MS),
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
    const result = queue.then(() => render(request, pdfRenderer, timeoutMs));
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
    handleSocket(socket, renderJob, timeoutMs);
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
