import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "../../platform/context.js";
import { registerSafeErrorHandler } from "../../platform/errors.js";
import type { DocumentService } from "./service.js";
import { registerDocumentRoutes } from "./routes.js";

const actor: ActorContext = {
  type: "human",
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  membershipId: "33333333-3333-4333-8333-333333333333",
  role: "member",
  requestId: "request-1",
};
const artifact = vi.fn();
const input = vi.fn();

function appFor() {
  const app = Fastify();
  registerSafeErrorHandler(app);
  registerDocumentRoutes(app, {
    service: { artifact, input } as unknown as DocumentService,
    actorFor: () => actor,
  });
  return app;
}

afterEach(() => vi.clearAllMocks());

describe("document artifact routes", () => {
  it("serves PDF previews inline without changing private cache or authorization behavior", async () => {
    artifact.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
    });
    const app = appFor();

    const response = await app.inject({
      method: "GET",
      url: "/api/documents/document/versions/2/pdf?disposition=inline",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toBe(
      'inline; filename="document-2.pdf"',
    );
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(artifact).toHaveBeenCalledWith(actor, "document", 2, "pdf");
    await app.close();
  });

  it("keeps artifact downloads as attachments by default", async () => {
    artifact.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
    });
    const app = appFor();

    const response = await app.inject({
      method: "GET",
      url: "/api/documents/document/versions/2/pdf",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="document-2.pdf"',
    );
    expect(response.headers["cache-control"]).toBe("private, no-store");
    await app.close();
  });

  it("returns exact immutable input as a sanitized attachment and never uses an artifact", async () => {
    input.mockResolvedValue({
      body: "# Exact\n",
      format: "markdown",
      title: "Unsafe / title",
    });
    const app = appFor();
    const response = await app.inject({
      method: "GET",
      url: "/api/documents/document/versions/2/input",
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("# Exact\n");
    expect(response.headers["content-type"]).toContain(
      "text/plain; charset=utf-8",
    );
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="Unsafe-title.md"',
    );
    expect(input).toHaveBeenCalledWith(actor, "document", 2);
    expect(artifact).not.toHaveBeenCalled();
    await app.close();
  });

  it("keeps the removed source artifact route unavailable", async () => {
    const app = appFor();
    const removedKind = "source";
    const response = await app.inject({
      method: "GET",
      url: `/api/documents/document/versions/2/${removedKind}`,
    });
    expect(response.statusCode).toBe(404);
    expect(artifact).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects unsupported dispositions before loading an artifact", async () => {
    const app = appFor();

    const response = await app.inject({
      method: "GET",
      url: "/api/documents/document/versions/2/pdf?disposition=attachment",
    });

    expect(response.statusCode).toBe(400);
    expect(artifact).not.toHaveBeenCalled();
    await app.close();
  });
});
