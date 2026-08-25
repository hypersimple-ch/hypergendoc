import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Document,
  ResolvedStyleAssets,
  StyleDefinition,
  TemplateData,
  TemplateDefinition,
} from "@hypergendoc/contracts";
import type { ActorContext } from "../../platform/context.js";
import { AppError } from "../../platform/errors.js";
import type { BeginMutationOperation } from "../../platform/mutation-operations.js";
import { CompanyDocumentGitStore } from "./git-store.js";
import type { Renderer } from "./renderer-client.js";
import { createDocumentService } from "./service.js";
import type {
  DocumentRepository,
  DocumentSourceBuilder,
  StyleAssetResolver,
} from "./service-types.js";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  company: "00000000-0000-4000-8000-000000000002",
  otherCompany: "00000000-0000-4000-8000-000000000003",
  document: "00000000-0000-4000-8000-000000000004",
  style: "00000000-0000-4000-8000-000000000005",
  activeStyleVersion: "00000000-0000-4000-8000-000000000006",
  oldStyleVersion: "00000000-0000-4000-8000-000000000007",
  user: "00000000-0000-4000-8000-000000000008",
  credential: "00000000-0000-4000-8000-000000000009",
};
const definition = { bodyFont: "Inter" } as StyleDefinition;
const oldDefinition = { bodyFont: "Noto Sans" } as StyleDefinition;
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
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

interface FixtureTemplateVersion {
  readonly templateId: string;
  readonly versionId: string;
  readonly definition: TemplateDefinition;
}

async function fixture(
  options: {
    failWrite?: boolean;
    failTouch?: boolean;
    failAudit?: boolean;
    failRestore?: boolean;
    styleAssetResolver?: StyleAssetResolver;
    templateVersion?: FixtureTemplateVersion;
    hideStyleVersion?: boolean;
    styleDefinition?: StyleDefinition;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "hypergendoc-service-"));
  roots.push(root);
  const documents: Document[] = [];
  const audit = vi.fn(() =>
    options.failAudit
      ? Promise.reject(new Error("audit unavailable"))
      : Promise.resolve(),
  );
  const lockCompanyForGitWrites = vi.fn(() => Promise.resolve());
  let templateVersionCounter = 0;
  const touchDocument = vi.fn((_workspaceId: string, documentId: string) =>
    options.failTouch
      ? Promise.reject(new Error("database"))
      : Promise.resolve(
          documents.find((document) => document.id === documentId),
        ),
  );
  let transactionTail = Promise.resolve();
  const repository: DocumentRepository = {
    async transaction(operation) {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await operation(repository, { write: audit });
      } finally {
        release();
      }
    },
    companyExists: (workspaceId, companyId) =>
      Promise.resolve(
        workspaceId === ids.workspace && companyId === ids.company,
      ),
    findActiveStyle: (_workspaceId, companyId, styleId) =>
      Promise.resolve(
        companyId === ids.company && styleId === ids.style
          ? {
              id: ids.style,
              activeVersionId: ids.activeStyleVersion,
              definition,
            }
          : undefined,
      ),
    findStyleVersion: (_workspaceId, companyId, styleVersionId) =>
      Promise.resolve(
        options.hideStyleVersion || companyId !== ids.company
          ? undefined
          : styleVersionId === ids.activeStyleVersion
            ? { id: styleVersionId, definition: options.styleDefinition ?? definition }
            : styleVersionId === ids.oldStyleVersion
              ? { id: styleVersionId, definition: options.styleDefinition ?? oldDefinition }
              : undefined,
      ),
    findActiveStyleVersion: (_workspaceId, companyId, styleVersionId) =>
      Promise.resolve(
        companyId === ids.company && styleVersionId === ids.activeStyleVersion
          ? { id: styleVersionId, definition: options.styleDefinition ?? definition }
          : undefined,
      ),
    findActiveTemplate: (_workspaceId, companyId, templateId) =>
      Promise.resolve(
        companyId === ids.company &&
          templateId === options.templateVersion?.templateId
          ? {
              templateId,
              versionId: options.templateVersion.versionId,
              definition: options.templateVersion.definition,
            }
          : undefined,
      ),
    findTemplateVersion: (_workspaceId, companyId, versionId) =>
      Promise.resolve(
        companyId === ids.company &&
          versionId === options.templateVersion?.versionId
          ? {
              templateId: options.templateVersion.templateId,
              versionId,
              definition: options.templateVersion.definition,
            }
          : undefined,
      ),
    findDocument: (workspaceId, documentId) =>
      Promise.resolve(
        workspaceId === ids.workspace
          ? documents.find((document) => document.id === documentId)
          : undefined,
      ),
    listDocuments: (workspaceId, companyId) =>
      Promise.resolve(
        workspaceId === ids.workspace
          ? documents.filter(
              (document) => !companyId || document.companyId === companyId,
            )
          : [],
      ),
    lockDocument: (workspaceId, documentId) =>
      repository.findDocument(workspaceId, documentId),
    insertDocument: (input) => {
      const nextId =
        documents.length === 0
          ? ids.document
          : `00000000-0000-4000-8000-${String(documents.length + 1).padStart(12, "0")}`;
      const document: Document = {
        id: nextId,
        companyId: input.companyId,
        templateId: input.templateId ?? null,
        title: input.title,
        metadata: input.metadata ?? {},
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      };
      documents.push(document);
      return Promise.resolve(document);
    },
    createTemplateVersion: (input) => {
      const versionNumber = (templateVersionCounter =
        templateVersionCounter + 1);
      return Promise.resolve({
        id: `00000000-0000-4000-8000-${String(versionNumber).padStart(12, "0")}`,
        templateId: input.templateId,
        version: 99 + versionNumber,
        definition: input.definition,
        createdByUserId: input.createdByUserId ?? "",
        createdAt: new Date(0).toISOString(),
      });
    },
    touchDocument,
    lockCompanyForGitWrites,
  };
  const sourceBuilder: DocumentSourceBuilder = {
    resolve(format, body, style, assets) {
      return {
        body,
        source: `${format}:${style.bodyFont}:${body}:${JSON.stringify(assets)}`,
      };
    },
  };
  const render = vi.fn<Renderer["render"]>((input) => {
    if (input.format === "template")
      throw new Error("unexpected template request");
    const source = sourceBuilder.resolve(
      input.format,
      input.body,
      input.style,
      input.assets,
    ).source;
    const pdf = Buffer.from("%PDF-current");
    return Promise.resolve({
      ok: true,
      sourceHash: hash(source),
      pdfHash: hash(pdf),
      pdf,
      rendererVersion: "test",
    });
  });
  const renderer: Renderer = { render };
  const actualGit = new CompanyDocumentGitStore({ rootDir: root });
  const git =
    options.failWrite || options.failRestore
      ? {
          write: options.failWrite
            ? vi.fn(() => Promise.reject(new Error("disk")))
            : actualGit.write.bind(actualGit),
          readCurrent: actualGit.readCurrent.bind(actualGit),
          readHistorical: actualGit.readHistorical.bind(actualGit),
          history: actualGit.history.bind(actualGit),
          revert: actualGit.revert.bind(actualGit),
          checkpoint: actualGit.checkpoint.bind(actualGit),
          restoreCheckpoint: options.failRestore
            ? vi.fn(() => Promise.reject(new Error("restore failed")))
            : actualGit.restoreCheckpoint.bind(actualGit),
          completeCheckpoint: actualGit.completeCheckpoint.bind(actualGit),
        }
      : actualGit;
  const operations = {
    begin: vi.fn((input: BeginMutationOperation) =>
      Promise.resolve({
        ...input,
        id: "operation",
        targetId: input.targetId ?? null,
        externalReference: input.externalReference ?? null,
        status: "pending" as const,
        attempts: 0,
        replayed: false,
      }),
    ),
    markExternalApplied: vi.fn(() => Promise.resolve()),
    requireReconciliation: vi.fn(() => Promise.resolve()),
    complete: vi.fn(() => Promise.resolve()),
  };
  return {
    service: createDocumentService({
      repository,
      git,
      renderer,
      sourceBuilder,
      ...(options.styleAssetResolver
        ? { styleAssetResolver: options.styleAssetResolver }
        : {}),
      audit: { write: audit },
      operations,
    }),
    git: actualGit,
    render,
    audit,
    lockCompanyForGitWrites,
    touchDocument,
    operations,
  };
}

const createInput = {
  companyId: ids.company,
  styleId: ids.style,
  title: "Proposal",
  format: "markdown" as const,
  body: "# Exact\n",
};

async function created() {
  const state = await fixture();
  const result = await state.service.create(human, createInput);
  return { ...state, result };
}

const templateStyle: StyleDefinition = {
  assetVersion: 1,
  logoObjectId: null,
  bodyFont: "Inter",
  headingFont: "Playfair Display",
  bodySizePt: 10,
  headingScale: 1.8,
  italicStyle: "italic",
  colors: {
    text: "#202020",
    heading: "#111111",
    primary: "#3157c8",
    accent: "#80a3ed",
    muted: "#6b7280",
  },
  page: {
    size: "A4",
    marginTopMm: 18,
    marginRightMm: 18,
    marginBottomMm: 18,
    marginLeftMm: 18,
  },
  header: {
    enabled: true,
    leftText: "Example",
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
} as unknown as StyleDefinition;

const templateDefinition: TemplateDefinition = {
  schemaVersion: 1,
  styleVersionId: ids.activeStyleVersion,
  fields: {
    title: { type: "text", label: "Title", required: true },
  },
  pageMasters: { standard: {} },
  document: [
    {
      type: "page",
      master: "standard",
      children: [
        {
          type: "heading",
          content: [{ type: "binding", path: "title" }],
        },
      ],
    },
  ],
};

describe("DocumentService duplication", () => {
  it("duplicates a markdown document with a fresh initial commit", async () => {
    const { service } = await created();
    const copy = await service.duplicate(human, ids.document);
    expect(copy.document.id).not.toBe(ids.document);
    expect(copy.document.title).toBe("Proposal (copy)");
    expect(copy.document.companyId).toBe(ids.company);
    expect(copy.current.snapshot).toMatchObject({
      format: "markdown",
      body: "# Exact\n",
      styleVersionId: ids.activeStyleVersion,
    });
    // The copy owns exactly one commit of its own.
    expect(await service.history(human, copy.document.id)).toHaveLength(1);
    expect(await service.history(human, ids.document)).toHaveLength(1);
    // The source is untouched.
    const source = await service.detail(human, ids.document);
    expect(source.document.title).toBe("Proposal");
  });

  it("copies pinned template version and data for template documents", async () => {
    const templateIds = {
      templateId: ids.credential,
      versionId: ids.user,
    };
    const data: TemplateData = { title: "Quarterly review" };
    const { service } = await fixture({
      templateVersion: {
        ...templateIds,
        definition: templateDefinition,
      },
      styleDefinition: templateStyle,
    });
    const source = await service.createFromTemplate(human, {
      companyId: ids.company,
      templateId: templateIds.templateId,
      title: "Q1 report",
      data,
    });
    expect(source.current.snapshot.format).toBe("template");
    const copy = await service.duplicate(human, ids.document);
    expect(copy.document.templateId).toBe(templateIds.templateId);
    expect(copy.document.title).toBe("Q1 report (copy)");
    expect(copy.current.snapshot.format).toBe("template");
    expect(copy.current.snapshot.templateVersionId).toBe(
      templateIds.versionId,
    );
    expect(JSON.parse(copy.current.snapshot.body)).toEqual({
      schemaVersion: 1,
      templateVersionId: templateIds.versionId,
      data,
    });
  });

  it("rejects duplicates of missing documents or dangling style pins", async () => {
    const { service } = await created();
    await expect(service.duplicate(human, "missing")).rejects.toMatchObject({
      code: "not_found",
    });
    const state = await fixture({ hideStyleVersion: true });
    await state.service.create(human, createInput);
    await expect(
      state.service.duplicate(human, ids.document),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("requires the documents:write action for agent duplicates", async () => {
    const { service } = await created();
    await expect(
      service.duplicate(agent(["documents:read"]), ids.document),
    ).rejects.toMatchObject({ code: "not_found" });
    const ok = await service.duplicate(agent(), ids.document);
    expect(ok.document.title).toBe("Proposal (copy)");
  });
});

describe("DocumentService restyle", () => {
  const templateIds = {
    templateId: ids.credential,
    versionId: ids.user,
  };
  const data: TemplateData = { title: "Quarterly review" };

  async function templated() {
    const state = await fixture({
      templateVersion: { ...templateIds, definition: templateDefinition },
      styleDefinition: templateStyle,
    });
    await state.service.createFromTemplate(human, {
      companyId: ids.company,
      templateId: templateIds.templateId,
      title: "Q1 report",
      data,
    });
    return state;
  }

  it("creates a new template version pin and a new commit with unchanged data", async () => {
    const { service } = await templated();
    const result = await service.restyle(human, ids.document, {
      styleVersionId: ids.oldStyleVersion,
    });
    expect(result.snapshot.format).toBe("template");
    expect(result.snapshot.styleVersionId).toBe(ids.oldStyleVersion);
    expect(result.snapshot.templateVersionId).not.toBe(templateIds.versionId);
    expect(JSON.parse(result.snapshot.body)).toEqual({
      schemaVersion: 1,
      templateVersionId: result.snapshot.templateVersionId,
      data,
    });
    // Exactly one new commit; prior history remains immutable.
    const commits = await service.history(human, ids.document);
    expect(commits).toHaveLength(2);
    expect(commits[1]?.commitSha).toBe(commits[0]?.parentCommitSha);
  });

  it("rejects markdown documents, unknown styles, and no-op pins", async () => {
    const { service } = await created();
    await expect(
      service.restyle(human, ids.document, {
        styleVersionId: ids.oldStyleVersion,
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });

    const state = await templated();
    await expect(
      state.service.restyle(human, ids.document, {
        styleVersionId: "00000000-0000-4000-8000-0000000000ff",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    // Restyling to the currently pinned style is a rejected no-op.
    await expect(
      state.service.restyle(human, ids.document, {
        styleVersionId: templateDefinition.styleVersionId,
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("requires the documents:write action for agent restyles", async () => {
    const { service } = await templated();
    await expect(
      service.restyle(agent(["documents:read"]), ids.document, {
        styleVersionId: ids.oldStyleVersion,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    const ok = await service.restyle(agent(), ids.document, {
      styleVersionId: ids.oldStyleVersion,
    });
    expect(ok.snapshot.styleVersionId).toBe(ids.oldStyleVersion);
  });
});

describe("DocumentService Git history", () => {
  it("creates one exact source commit without rendering or artifacts", async () => {
    const { service, result, render, lockCompanyForGitWrites } =
      await created();
    expect(result.current.snapshot).toMatchObject({
      format: "markdown",
      body: "# Exact\n",
      styleVersionId: ids.activeStyleVersion,
    });
    expect(result.current.commit.createdByType).toBe("user");
    expect(result.document.metadata).toEqual({});
    expect(await service.history(human, ids.document)).toHaveLength(1);
    expect(render).not.toHaveBeenCalled();
    expect(lockCompanyForGitWrites).toHaveBeenCalledWith(
      ids.workspace,
      ids.company,
    );
  });

  it("updates exact source, inherits style, and supports format changes", async () => {
    const { service } = await created();
    const updated = await service.update(human, ids.document, {
      format: "html",
      body: "  <p>Exact</p>\n",
    });
    expect(updated.snapshot).toMatchObject({
      format: "html",
      body: "  <p>Exact</p>\n",
      styleVersionId: ids.activeStyleVersion,
    });
    expect(await service.history(human, ids.document)).toHaveLength(2);
  });

  it("rejects inactive explicit style versions", async () => {
    const { service } = await created();
    await expect(
      service.update(human, ids.document, {
        format: "markdown",
        body: "next",
        styleVersionId: ids.oldStyleVersion,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("reads historical source and reverts by appending a commit", async () => {
    const { service, result } = await created();
    await service.update(human, ids.document, {
      format: "html",
      body: "<p>new</p>",
    });
    const old = await service.readCommit(
      human,
      ids.document,
      result.current.snapshot.commitSha,
    );
    expect(old.snapshot.body).toBe("# Exact\n");
    const reverted = await service.revert(human, ids.document, {
      commitSha: result.current.snapshot.commitSha,
    });
    expect(reverted.snapshot.body).toBe("# Exact\n");
    expect(reverted.snapshot.commitSha).not.toBe(
      result.current.snapshot.commitSha,
    );
    expect(await service.history(human, ids.document)).toHaveLength(3);
  });

  it("renders only the current snapshot and streams verified PDF bytes", async () => {
    const { service, render } = await created();
    await service.update(human, ids.document, {
      format: "html",
      body: "<p>current</p>",
    });
    const pdf = await service.pdf(human, ids.document);
    expect(Buffer.from(pdf.bytes).toString()).toBe("%PDF-current");
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ format: "html", body: "<p>current</p>" }),
    );
  });

  it("resolves assets once and gives identical bytes to source hashing and renderer", async () => {
    const assets: ResolvedStyleAssets = { logo: null, fonts: [] };
    const resolve = vi.fn(() => Promise.resolve(assets));
    const resolver: StyleAssetResolver = { resolve };
    const { service, render } = await fixture({ styleAssetResolver: resolver });
    await service.create(human, createInput);
    await service.pdf(human, ids.document);
    expect(resolve).toHaveBeenLastCalledWith(
      ids.workspace,
      ids.company,
      definition,
    );
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ assets }));
  });

  it("serializes concurrent company writes and keeps both commits", async () => {
    const { service } = await created();
    await Promise.all([
      service.update(human, ids.document, { format: "markdown", body: "one" }),
      service.update(human, ids.document, { format: "markdown", body: "two" }),
    ]);
    expect(await service.history(human, ids.document)).toHaveLength(3);
  });

  it("does not commit when the database projection fails", async () => {
    const state = await fixture({ failTouch: true });
    await state.service.create(human, createInput);
    await expect(
      state.service.update(human, ids.document, {
        format: "markdown",
        body: "must not commit",
      }),
    ).rejects.toThrow("database");
    expect(await state.service.history(human, ids.document)).toHaveLength(1);
  });

  it("masks unauthorized agent access and Git failures", async () => {
    const { service } = await created();
    await expect(
      service.detail(agent([], []), ids.document),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    const failed = await fixture({ failWrite: true });
    await expect(
      failed.service.create(human, createInput),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("compensates Git and closes the journal when transactional audit fails", async () => {
    const state = await fixture({ failAudit: true });
    await expect(state.service.create(human, createInput)).rejects.toThrow(
      "audit unavailable",
    );
    expect(state.operations.markExternalApplied).toHaveBeenCalledOnce();
    expect(state.operations.complete).toHaveBeenCalledWith("operation");
    expect(state.operations.requireReconciliation).not.toHaveBeenCalled();
  });

  it("keeps the Git checkpoint recoverable when compensation fails", async () => {
    const state = await fixture({ failAudit: true, failRestore: true });
    await expect(
      state.service.create(human, createInput),
    ).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(state.operations.requireReconciliation).toHaveBeenCalledWith(
      "operation",
      "git_compensation_failed",
    );
    const begin = state.operations.begin.mock.calls[0]?.[0];
    expect(begin).not.toHaveProperty("body");
    expect(begin?.externalReference).not.toContain("# Exact");
  });
});
