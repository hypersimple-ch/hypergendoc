/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Document, StyleDefinition } from "@hypergendoc/contracts";
import type { ActorContext } from "../../platform/context.js";
import type { ObjectStore, StoredObject } from "../../platform/object-store.js";
import type { RenderResult } from "./renderer-client.js";
import {
  createDocumentService,
  type DocumentRepository,
  type DocumentVersionRow,
} from "./service.js";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  company: "00000000-0000-4000-8000-000000000002",
  otherCompany: "00000000-0000-4000-8000-000000000003",
  style: "00000000-0000-4000-8000-000000000004",
  activeStyleVersion: "00000000-0000-4000-8000-000000000005",
  oldStyleVersion: "00000000-0000-4000-8000-000000000006",
  user: "00000000-0000-4000-8000-000000000007",
  credential: "00000000-0000-4000-8000-000000000008",
};
const definition = {
  logoObjectId: null,
  bodyFont: "Inter",
} as unknown as StyleDefinition;
const oldDefinition = {
  logoObjectId: null,
  bodyFont: "Noto Sans",
} as unknown as StyleDefinition;
const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const human: ActorContext = {
  type: "human",
  userId: ids.user,
  workspaceId: ids.workspace,
  membershipId: "membership",
  role: "member",
  requestId: "request",
};
const agent = (
  actions = ["documents:read", "documents:write"],
  companies = [ids.company],
): ActorContext => ({
  type: "agent",
  credentialId: ids.credential,
  workspaceId: ids.workspace,
  actions,
  allowedCompanyIds: companies,
  requestId: "request",
});

function fixture(
  options: {
    renderer?: (source: string) => RenderResult;
    failInsert?: boolean;
    failPdfPut?: boolean;
  } = {},
) {
  const documents: Document[] = [];
  const versions: DocumentVersionRow[] = [];
  const stored: { id: string; object: StoredObject }[] = [];
  const deleted: string[] = [];
  const accessed: string[] = [];
  let sequence = 10;
  const source = (body: string, style: StyleDefinition) =>
    `source:${style.bodyFont}:${body.trim()}`;
  const objects: ObjectStore = {
    putPrivate: async (input) => {
      if (options.failPdfPut && input.contentType === "application/pdf")
        throw new Error("object store unavailable");
      const object = {
        key: `object-${sequence++}`,
        sha256: hash(input.bytes),
        bytes: input.bytes.byteLength,
        contentType: input.contentType,
      };
      return object;
    },
    delete: async (key) => void deleted.push(key),
    authorizedGet: async ({ key, authorize }) => {
      if (!(await authorize())) throw new Error("denied");
      accessed.push(key);
      return {
        bytes: Buffer.from(key),
        contentType: "application/octet-stream",
      };
    },
  };
  const repository: DocumentRepository = {
    transaction: async (work) => work(repository),
    companyExists: async (workspace, company) =>
      workspace === ids.workspace && company === ids.company,
    findActiveStyle: async (_workspace, company, style) =>
      company === ids.company && style === ids.style
        ? { id: ids.style, activeVersionId: ids.activeStyleVersion, definition }
        : undefined,
    findStyleVersion: async (_workspace, company, id) =>
      company === ids.company && id === ids.oldStyleVersion
        ? { id, definition: oldDefinition }
        : id === ids.activeStyleVersion && company === ids.company
          ? { id, definition }
          : undefined,
    findActiveStyleVersion: async (_workspace, company, id) =>
      company === ids.company && id === ids.activeStyleVersion
        ? { id, definition }
        : undefined,
    findDocument: async (workspace, id) =>
      workspace === ids.workspace
        ? documents.find((item) => item.id === id)
        : undefined,
    listDocuments: async (_workspace, company) =>
      documents.filter((item) => !company || item.companyId === company),
    lockDocument: async (_workspace, id) =>
      documents.find((item) => item.id === id),
    findVersion: async (_workspace, documentId, number) =>
      versions.find(
        (item) => item.documentId === documentId && item.version === number,
      ),
    listVersions: async (_workspace, documentId) =>
      versions.filter((item) => item.documentId === documentId),
    findLatestVersion: async (_workspace, documentId) =>
      versions.filter((item) => item.documentId === documentId).at(-1),
    insertDocument: async (input) => {
      const document: Document = {
        id: `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
        companyId: input.companyId,
        title: input.title,
        currentVersionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      documents.push(document);
      return document;
    },
    insertVersion: async (input) => {
      const row: DocumentVersionRow = {
        id: `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
        documentId: input.documentId,
        version: input.version,
        styleVersionId: input.styleVersionId,
        body: input.normalizedBody,
        status: "pending",
        inputHash: input.inputHash,
        sourceHash: null,
        outputHash: null,
        rendererVersion: null,
        createdByType: input.createdByType,
        createdById: input.createdById,
        createdAt: new Date().toISOString(),
        sourceObjectId: null,
        pdfObjectId: null,
      };
      versions.push(row);
      return row;
    },
    insertRenderRecord: async () => undefined,
    insertStoredObject: async ({ object }) => {
      if (options.failInsert) throw new Error("database failed");
      const row = { id: `object-row-${sequence++}`, object };
      stored.push(row);
      return { id: row.id, objectKey: object.key };
    },
    markReadyAndAdvanceCurrent: async (input) => {
      const row = versions.find((item) => item.id === input.documentVersionId);
      if (!row) throw new Error("missing version");
      Object.assign(row, {
        status: "ready",
        sourceHash: input.sourceHash,
        outputHash: input.outputHash,
        rendererVersion: input.rendererVersion,
        sourceObjectId: input.sourceObjectId,
        pdfObjectId: input.pdfObjectId,
      });
      const document = documents.find((item) => item.id === input.documentId);
      if (document) document.currentVersionId = row.id;
    },
    markFailed: async (input) => {
      const row = versions.find((item) => item.id === input.documentVersionId);
      if (row && row.status === "pending")
        Object.assign(row, {
          status: "failed",
          rendererVersion: input.rendererVersion,
        });
    },
    findArtifact: async (_workspace, documentId, number, kind) => {
      const row = versions.find(
        (item) => item.documentId === documentId && item.version === number,
      );
      const storedRow = stored.find(
        (item) =>
          item.id ===
          (kind === "source" ? row?.sourceObjectId : row?.pdfObjectId),
      );
      return storedRow
        ? { objectKey: storedRow.object.key, companyId: ids.company }
        : undefined;
    },
  };
  const renderer = {
    render: vi.fn(
      async ({ body, style }: { body: string; style: StyleDefinition }) => {
        const renderedSource = source(body, style);
        return (
          options.renderer?.(renderedSource) ?? {
            ok: true,
            sourceHash: hash(renderedSource),
            pdfHash: hash(Buffer.from("%PDF-1.7\n")),
            pdf: Buffer.from("%PDF-1.7\n"),
            rendererVersion: "renderer-1",
          }
        );
      },
    ),
  };
  return {
    service: createDocumentService({
      repository,
      objects,
      renderer,
      sourceBuilder: {
        resolve: (body, style) => ({
          normalizedBody: body.trim(),
          source: source(body.trim(), style),
        }),
      },
    }),
    documents,
    versions,
    deleted,
    accessed,
    renderer,
  };
}

const input = {
  companyId: ids.company,
  styleId: ids.style,
  title: "Document",
  body: " hello ",
};

describe("DocumentService", () => {
  it("creates for human and scoped agent actors, with pending evidence terminalized only after artifacts", async () => {
    const test = fixture();
    const created = await test.service.create(human, input);
    expect(created.version).toMatchObject({
      status: "ready",
      sourceObjectId: expect.any(String),
      pdfObjectId: expect.any(String),
      rendererVersion: "renderer-1",
    });
    await expect(
      test.service.create(agent([], [ids.company]), input),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      test.service.create(agent(), { ...input, companyId: ids.otherCompany }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("inherits the exact prior style unless an explicitly active style is selected", async () => {
    const test = fixture();
    const created = await test.service.create(human, input);
    test.versions[0]!.styleVersionId = ids.oldStyleVersion;
    await test.service.createVersion(human, created.document.id, {
      body: "revision",
    });
    expect(test.renderer.render.mock.calls.at(-1)?.[0].style).toEqual(
      oldDefinition,
    );
    await expect(
      test.service.createVersion(human, created.document.id, {
        body: "revision",
        styleVersionId: ids.oldStyleVersion,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await test.service.createVersion(human, created.document.id, {
      body: "revision",
      styleVersionId: ids.activeStyleVersion,
    });
    expect(test.renderer.render.mock.calls.at(-1)?.[0].style).toEqual(
      definition,
    );
  });

  it("fails on renderer hash mismatch and never advances the current pointer", async () => {
    const test = fixture({
      renderer: () => ({
        ok: true,
        sourceHash: "0".repeat(64),
        pdfHash: "0".repeat(64),
        pdf: Buffer.from("%PDF-1.7"),
        rendererVersion: "renderer-1",
      }),
    });
    const created = await test.service.create(human, input);
    expect(created.version.status).toBe("failed");
    expect(created.document.currentVersionId).toBeNull();
  });

  it("does not expose a partial ready version when artifact storage fails", async () => {
    const test = fixture({ failPdfPut: true });
    const created = await test.service.create(human, input);
    expect(created.version.status).toBe("failed");
    expect(created.document.currentVersionId).toBeNull();
    expect(test.deleted).toHaveLength(1);
  });

  it("cleans both private blobs when terminal database work fails", async () => {
    const test = fixture({ failInsert: true });
    const created = await test.service.create(human, input);
    expect(created.version.status).toBe("failed");
    expect(test.deleted).toHaveLength(2);
    expect(created.document.currentVersionId).toBeNull();
  });

  it("authorizes private source/PDF access and hides cross-tenant documents", async () => {
    const test = fixture();
    const created = await test.service.create(human, input);
    await expect(
      test.service.artifact(
        agent(["documents:read"]),
        created.document.id,
        1,
        "source",
      ),
    ).resolves.toMatchObject({ contentType: "text/plain; charset=utf-8" });
    await expect(
      test.service.artifact(
        agent(["documents:read"], []),
        created.document.id,
        1,
        "pdf",
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      test.service.get({ ...human, workspaceId: "other" }, created.document.id),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
