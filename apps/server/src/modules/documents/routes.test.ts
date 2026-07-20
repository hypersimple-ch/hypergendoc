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
const sha = "a".repeat(40);
const pdf = vi.fn();
const readCommit = vi.fn();
const get = vi.fn();
const update = vi.fn();
const revert = vi.fn();

function appFor() {
  const app = Fastify();
  registerSafeErrorHandler(app);
  registerDocumentRoutes(app, {
    service: {
      pdf,
      readCommit,
      get,
      update,
      revert,
    } as unknown as DocumentService,
    actorFor: () => actor,
  });
  return app;
}

afterEach(() => vi.clearAllMocks());

describe("Git-backed document routes", () => {
  it("streams the current PDF inline only from the current endpoint", async () => {
    pdf.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      commitSha: sha,
    });
    const app = appFor();
    const response = await app.inject({
      method: "GET",
      url: "/api/documents/document/pdf?disposition=inline",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toBe(
      `inline; filename="document-${sha.slice(0, 12)}.pdf"`,
    );
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["x-document-commit"]).toBe(sha);
    expect(pdf).toHaveBeenCalledWith(actor, "document");
    await app.close();
  });

  it("uses attachment disposition by default and validates overrides", async () => {
    pdf.mockResolvedValue({
      bytes: new Uint8Array([1]),
      contentType: "application/pdf",
      commitSha: sha,
    });
    const app = appFor();
    const attachment = await app.inject({
      method: "GET",
      url: "/api/documents/document/pdf",
    });
    expect(attachment.headers["content-disposition"]).toContain("attachment;");
    const invalid = await app.inject({
      method: "GET",
      url: "/api/documents/document/pdf?disposition=open",
    });
    expect(invalid.statusCode).toBe(400);
    expect(pdf).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("downloads exact historical source with a sanitized title", async () => {
    readCommit.mockResolvedValue({
      commit: {},
      snapshot: { commitSha: sha, body: "# Exact\n", format: "markdown" },
    });
    get.mockResolvedValue({ title: "Unsafe / title" });
    const app = appFor();
    const response = await app.inject({
      method: "GET",
      url: `/api/documents/document/commits/${sha}/source`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("# Exact\n");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="Unsafe-title.md"',
    );
    expect(response.headers["x-document-commit"]).toBe(sha);
    expect(readCommit).toHaveBeenCalledWith(actor, "document", sha);
    expect(pdf).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects malformed commit identifiers before repository access", async () => {
    const app = appFor();
    const response = await app.inject({
      method: "GET",
      url: "/api/documents/document/commits/..%2Fsecret/source",
    });
    expect(response.statusCode).toBe(404);
    expect(readCommit).not.toHaveBeenCalled();
    await app.close();
  });

  it("delegates current source updates and append-only reverts", async () => {
    update.mockResolvedValue({ snapshot: { commitSha: sha } });
    revert.mockResolvedValue({ snapshot: { commitSha: "b".repeat(40) } });
    const app = appFor();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/documents/document/source",
          payload: { format: "markdown", body: "next" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/documents/document/revert",
          payload: { commitSha: sha },
        })
      ).statusCode,
    ).toBe(200);
    expect(update).toHaveBeenCalled();
    expect(revert).toHaveBeenCalled();
    await app.close();
  });

  it("leaves removed numeric-version routes unavailable", async () => {
    const app = appFor();
    const response = await app.inject({
      method: "GET",
      url: "/api/documents/document/versions/2/pdf",
    });
    expect(response.statusCode).toBe(404);
    expect(pdf).not.toHaveBeenCalled();
    await app.close();
  });
});
