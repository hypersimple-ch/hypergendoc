import { createHash, randomUUID } from "node:crypto";
import { createServer, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { StyleDefinition } from "@hypergendoc/contracts";
import { createUnixSocketRenderer } from "./renderer-client.js";

const definition = { logoObjectId: null } as StyleDefinition;
const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const servers: ReturnType<typeof createServer>[] = [];

async function server(
  respond: (request: { requestId: string }, socket: Socket) => void,
): Promise<string> {
  const path = `/tmp/hypergendoc-renderer-${randomUUID()}.sock`;
  const instance = createServer((socket) => {
    let frame = "";
    socket.on("data", (chunk) => {
      frame += chunk.toString("utf8");
      if (!frame.endsWith("\n")) return;
      respond(JSON.parse(frame) as { requestId: string }, socket);
    });
  });
  await new Promise<void>((resolve) => instance.listen(path, resolve));
  servers.push(instance);
  return path;
}
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (instance) =>
          new Promise<void>((resolve) => instance.close(() => resolve())),
      ),
  );
});

describe("Unix renderer protocol", () => {
  it("accepts a complete response split across socket chunks", async () => {
    const pdf = Buffer.from("%PDF-1.7\n");
    const path = await server(({ requestId }, socket) => {
      const response = JSON.stringify({
        protocol: "hypergendoc-render-v2",
        requestId,
        ok: true,
        sourceHash: hash("source"),
        pdfHash: hash(pdf),
        pdfBase64: pdf.toString("base64"),
      });
      socket.write(response.slice(0, 15));
      socket.end(`${response.slice(15)}\n`);
    });
    const result = await createUnixSocketRenderer(path, 100).render({
      format: "markdown",
      body: "body",
      style: definition,
    });
    expect(result).toMatchObject({ ok: true, pdfHash: hash(pdf) });
  });

  it("rejects oversized or multi-frame responses", async () => {
    const path = await server(({ requestId }, socket) => {
      socket.end(
        `${JSON.stringify({ protocol: "hypergendoc-render-v2", requestId, ok: false })}\nextra`,
      );
    });
    await expect(
      createUnixSocketRenderer(path, 100).render({
        format: "html",
        body: "body",
        style: definition,
      }),
    ).resolves.toMatchObject({ ok: false, error: "render_failed" });
  });

  it("bounds a renderer that never responds", async () => {
    const path = await server(() => undefined);
    await expect(
      createUnixSocketRenderer(path, 10).render({
        format: "markdown",
        body: "body",
        style: definition,
      }),
    ).resolves.toMatchObject({ ok: false, error: "dependency_unavailable" });
  });
});
