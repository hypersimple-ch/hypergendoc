import fs from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as git from "isomorphic-git";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DocumentCommitSchema,
  DocumentDetailSchema,
} from "@hypergendoc/contracts";
import { toDocumentCommit, toDocumentSnapshot } from "./commit-mappers.js";
import {
  CompanyDocumentGitStore,
  GitDocumentNotFoundError,
  GitDocumentStoreValidationError,
} from "./git-store.js";

const ids = {
  workspace: "11111111-1111-4111-8111-111111111111",
  otherWorkspace: "22222222-2222-4222-8222-222222222222",
  company: "33333333-3333-4333-8333-333333333333",
  otherCompany: "44444444-4444-4444-8444-444444444444",
  document: "55555555-5555-4555-8555-555555555555",
  style: "66666666-6666-4666-8666-666666666666",
  nextStyle: "77777777-7777-4777-8777-777777777777",
  templateVersion: "99999999-9999-4999-8999-999999999999",
  actor: "88888888-8888-4888-8888-888888888888",
};

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function store(): Promise<CompanyDocumentGitStore> {
  const root = await mkdtemp(join(tmpdir(), "hypergendoc-git-store-"));
  roots.push(root);
  return new CompanyDocumentGitStore({ rootDir: root });
}

function writeInput(
  overrides: Partial<Parameters<CompanyDocumentGitStore["write"]>[0]> = {},
) {
  return {
    workspaceId: ids.workspace,
    companyId: ids.company,
    documentId: ids.document,
    body: "# exact\r\n\r\nbody  \r\n",
    format: "markdown" as const,
    styleVersionId: ids.style,
    actor: { type: "user" as const, id: ids.actor },
    ...overrides,
  };
}

describe("CompanyDocumentGitStore", () => {
  it("isolates repositories and rejects IDs that could become paths", async () => {
    const gitStore = await store();
    await gitStore.write(writeInput());
    await gitStore.write(
      writeInput({
        workspaceId: ids.otherWorkspace,
        companyId: ids.otherCompany,
        body: "isolated",
      }),
    );

    expect(await gitStore.readCurrent(writeInput())).toMatchObject({
      body: writeInput().body,
    });
    await expect(
      gitStore.readCurrent({
        workspaceId: ids.otherWorkspace,
        companyId: ids.otherCompany,
        documentId: ids.document,
      }),
    ).resolves.toMatchObject({ body: "isolated" });
    expect(() => gitStore.repositoryPath("../escape", ids.company)).toThrow(
      GitDocumentStoreValidationError,
    );
    await expect(
      gitStore.write(
        writeInput({ documentId: "55555555-5555-4555-8555-55555555555/" }),
      ),
    ).rejects.toThrow(GitDocumentStoreValidationError);
  });

  it("preserves the exact body and writes generated commit metadata", async () => {
    const gitStore = await store();
    const revision = await gitStore.write(writeInput());

    expect(await gitStore.readCurrent(writeInput())).toEqual(revision);
    const rawCommit = await git.readCommit({
      fs,
      dir: gitStore.repositoryPath(ids.workspace, ids.company),
      oid: revision.commitId,
    });
    expect(rawCommit.commit.message).toContain(
      `Document-Id: ${ids.document}\nStyle-Version-Id: ${ids.style}\nFormat: markdown\nActor-Type: user\nActor-Id: ${ids.actor}`,
    );
    const history = await gitStore.history(writeInput());
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      commitId: revision.commitId,
      format: "markdown",
      styleVersionId: ids.style,
      actor: { type: "user", id: ids.actor },
    });
  });

  it.each([
    { type: "user" as const, id: "tmMw4N9FeELUeIppXC6papyrOKqJJJ8h" },
    { type: "user" as const, id: "authUser_123-safe" },
    { type: "user" as const, id: ids.actor },
    { type: "user" as const, id: "a".repeat(128) },
    { type: "credential" as const, id: ids.actor },
  ])("exposes valid Git author metadata in document detail: $type/$id", async (actor) => {
    const gitStore = await store();
    const input = writeInput({ actor });
    await gitStore.write(input);
    const revision = await gitStore.readCurrent(input);
    const history = await gitStore.history(input);
    const commits = history.map((entry) => toDocumentCommit(ids.document, entry));
    const commit = commits[0]!;

    expect(DocumentCommitSchema.parse(commit)).toMatchObject({
      createdByType: actor.type,
      createdById: actor.id,
      commitSha: revision.commitId,
    });
    const detail = DocumentDetailSchema.parse({
      document: {
        id: ids.document,
        companyId: ids.company,
        title: "Author contract regression",
        createdAt: commit.createdAt,
        updatedAt: commit.createdAt,
      },
      current: {
        commit,
        snapshot: toDocumentSnapshot(ids.document, revision),
      },
      commits,
    });
    expect(detail.current.commit.createdById).toBe(actor.id);
    expect(detail.commits[0]?.createdById).toBe(actor.id);
    expect(detail.current.snapshot.body).toBe(input.body);
  });

  it.each([
    { type: "user" as const, id: "" },
    { type: "user" as const, id: "unsafe\nActor-Type: credential" },
    { type: "user" as const, id: "authUser_123\n" },
    { type: "user" as const, id: "../escape" },
    { type: "user" as const, id: "user/name" },
    { type: "user" as const, id: "unsafe user" },
    { type: "user" as const, id: "a".repeat(129) },
    { type: "credential" as const, id: "authUser_123" },
  ])("rejects unsafe Git and response author IDs: $type/$id", async (actor) => {
    const gitStore = await store();
    await gitStore.write(writeInput());
    const history = await gitStore.history(writeInput());
    const commit = toDocumentCommit(ids.document, history[0]!);

    const result = DocumentCommitSchema.safeParse({
      ...commit,
      createdByType: actor.type,
      createdById: actor.id,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
        "createdById",
      ]);
    }
    await expect(
      gitStore.write(writeInput({ actor })),
    ).rejects.toThrow(GitDocumentStoreValidationError);
    expect(await gitStore.history(writeInput())).toEqual(history);
  });

  it("reads the HEAD document commit when commit timestamps are non-monotonic", async () => {
    const gitStore = await store();
    await gitStore.write(writeInput({ body: "older" }));
    const repo = gitStore.repositoryPath(ids.workspace, ids.company);
    const path = join(repo, "documents", ids.document, "document.md");
    const body = "latest reachable";

    await writeFile(path, body);
    await git.add({
      fs,
      dir: repo,
      filepath: join("documents", ids.document, "document.md"),
    });
    const commitId = await git.commit({
      fs,
      dir: repo,
      ref: "main",
      message: `Document update\n\nDocument-Id: ${ids.document}\nStyle-Version-Id: ${ids.style}\nFormat: markdown\nActor-Type: user\nActor-Id: ${ids.actor}`,
      author: { name: "test", email: "test@example.com", timestamp: 1 },
      committer: { name: "test", email: "test@example.com", timestamp: 1 },
    });

    const [latest] = await gitStore.history(writeInput());
    expect(latest).toMatchObject({ commitId });
    await expect(gitStore.readCurrent(writeInput())).resolves.toMatchObject({
      commitId,
      body,
    });
  });

  it("renames format paths and follows history across markdown/html changes", async () => {
    const gitStore = await store();
    const markdown = await gitStore.write(writeInput({ body: "markdown" }));
    const html = await gitStore.write(
      writeInput({
        body: "<p>html</p>",
        format: "html",
        styleVersionId: ids.nextStyle,
      }),
    );
    const repo = gitStore.repositoryPath(ids.workspace, ids.company);
    const markdownPath = join(repo, "documents", ids.document, "document.md");
    const htmlPath = join(repo, "documents", ids.document, "document.html");

    await expect(readFile(markdownPath)).rejects.toThrow();
    await expect(readFile(htmlPath, "utf8")).resolves.toBe("<p>html</p>");
    await expect(
      gitStore.readHistorical({ ...writeInput(), commitId: markdown.commitId }),
    ).resolves.toMatchObject({ body: "markdown", format: "markdown" });
    await expect(gitStore.history(writeInput())).resolves.toMatchObject([
      { commitId: html.commitId },
      { commitId: markdown.commitId },
    ]);
  });

  it("stores canonical template data in JSON with pinned template metadata", async () => {
    const gitStore = await store();
    const body = `${JSON.stringify({ schemaVersion: 1, templateVersionId: ids.templateVersion, data: { title: "Example" } })}
`;
    const revision = await gitStore.write(
      writeInput({
        body,
        format: "template",
        templateVersionId: ids.templateVersion,
      }),
    );
    const repo = gitStore.repositoryPath(ids.workspace, ids.company);
    await expect(
      readFile(join(repo, "documents", ids.document, "document.json"), "utf8"),
    ).resolves.toBe(body);
    await expect(gitStore.readCurrent(writeInput())).resolves.toMatchObject({
      commitId: revision.commitId,
      format: "template",
      templateVersionId: ids.templateVersion,
      body,
    });
    await expect(gitStore.history(writeInput())).resolves.toMatchObject([
      { format: "template", templateVersionId: ids.templateVersion },
    ]);
  });

  it("reads an older blob and reverts by appending a new commit", async () => {
    const gitStore = await store();
    const first = await gitStore.write(writeInput({ body: "first" }));
    await gitStore.write(
      writeInput({ body: "second", styleVersionId: ids.nextStyle }),
    );
    const reverted = await gitStore.revert({
      ...writeInput(),
      commitId: first.commitId,
      actor: { type: "credential", id: ids.actor },
    });

    expect(reverted.commitId).not.toBe(first.commitId);
    expect(reverted).toMatchObject({
      body: "first",
      format: "markdown",
      styleVersionId: ids.style,
      actor: { type: "credential", id: ids.actor },
    });
    await expect(gitStore.history(writeInput())).resolves.toHaveLength(3);
  });

  it("restores a checkpoint after a surrounding transaction fails", async () => {
    const gitStore = await store();
    await gitStore.write(writeInput({ body: "baseline" }));
    const checkpoint = await gitStore.checkpoint(ids.workspace, ids.company);
    const mutation = await gitStore.write(
      writeInput({ body: "uncommitted projection" }),
    );

    await gitStore.restoreCheckpoint(checkpoint, mutation.commitId);

    await expect(gitStore.readCurrent(writeInput())).resolves.toMatchObject({
      body: "baseline",
    });
    await expect(gitStore.history(writeInput())).resolves.toHaveLength(1);
  });

  it("rejects malformed SHAs and missing documents", async () => {
    const gitStore = await store();
    await expect(gitStore.readCurrent(writeInput())).rejects.toThrow(
      GitDocumentNotFoundError,
    );
    await gitStore.write(writeInput());
    await expect(
      gitStore.readHistorical({ ...writeInput(), commitId: "MAIN" }),
    ).rejects.toThrow(GitDocumentStoreValidationError);
    await expect(
      gitStore.readHistorical({
        ...writeInput(),
        commitId: "a".repeat(40).toUpperCase(),
      }),
    ).rejects.toThrow(GitDocumentStoreValidationError);
    await expect(
      gitStore.readHistorical({ ...writeInput(), commitId: "a".repeat(40) }),
    ).rejects.toThrow(GitDocumentNotFoundError);
  });

  it("restores document files when a mutation fails after staging begins", async () => {
    const gitStore = await store();
    await gitStore.write(writeInput({ body: "baseline" }));
    const repo = gitStore.repositoryPath(ids.workspace, ids.company);
    await rm(join(repo, ".git", "objects"), { recursive: true });
    await writeFile(join(repo, ".git", "objects"), "not a directory");

    await expect(
      gitStore.write(writeInput({ body: "<p>new</p>", format: "html" })),
    ).rejects.toThrow();
    await expect(
      readFile(join(repo, "documents", ids.document, "document.md"), "utf8"),
    ).resolves.toBe("baseline");
    await expect(
      readFile(join(repo, "documents", ids.document, "document.html")),
    ).rejects.toThrow();
  });
});
