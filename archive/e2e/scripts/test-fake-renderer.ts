/** TEST-ONLY renderer for the composition E2E profile. Never use in production. */
import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { createLatexDocumentSourceBuilder } from "../apps/server/src/modules/documents/source-builder.js";

const socketPath =
  process.env.RENDERER_SOCKET ?? "/run/hypergendoc/renderer.sock";
const pdf = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

async function main(): Promise<void> {
  await mkdir(socketPath.slice(0, socketPath.lastIndexOf("/")), {
    recursive: true,
  });
  await rm(socketPath, { force: true });
  const sourceBuilder = createLatexDocumentSourceBuilder();
  const server = createServer((socket) => {
    let frame = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => (frame += chunk));
    socket.on("end", () => {
      try {
        const request = JSON.parse(frame) as {
          protocol: string;
          requestId: string;
          body: string;
          style: Parameters<typeof sourceBuilder.resolve>[1];
        };
        const source = sourceBuilder.resolve(
          request.body,
          request.style,
        ).source;
        socket.end(
          `${JSON.stringify({
            protocol: "hypergendoc-render-v1",
            requestId: request.requestId,
            ok: true,
            sourceHash: digest(source),
            pdfHash: digest(pdf),
            pdfBase64: pdf.toString("base64"),
          })}\n`,
        );
      } catch {
        socket.end(
          '{"protocol":"hypergendoc-render-v1","ok":false,"error":"render_failed"}\n',
        );
      }
    });
  });
  server.listen(socketPath);
}

void main();
