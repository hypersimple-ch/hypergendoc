import fs from "node:fs";
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import * as git from "isomorphic-git";

export type DocumentGitFormat = "markdown" | "html" | "template";
export type DocumentGitActorType = "user" | "credential";

export interface CompanyDocumentGitStoreOptions {
  /** An absolute, durable filesystem location owned by the caller. */
  readonly rootDir: string;
}

export interface DocumentGitIdentity {
  readonly workspaceId: string;
  readonly companyId: string;
  readonly documentId: string;
}

export interface DocumentGitActor {
  readonly type: DocumentGitActorType;
  readonly id: string;
}

export interface WriteDocumentGitInput extends DocumentGitIdentity {
  readonly body: string;
  readonly format: DocumentGitFormat;
  readonly styleVersionId: string;
  readonly templateVersionId?: string | undefined;
  readonly actor: DocumentGitActor;
}

export type ReadDocumentGitInput = DocumentGitIdentity;

export interface ReadHistoricalDocumentGitInput extends DocumentGitIdentity {
  readonly commitId: string;
}

export interface RevertDocumentGitInput extends DocumentGitIdentity {
  readonly commitId: string;
  readonly actor: DocumentGitActor;
}

export interface GitDocumentCheckpoint extends Omit<
  DocumentGitIdentity,
  "documentId"
> {
  readonly headCommitId: string | null;
  /** Process-local lease spanning the caller's surrounding DB transaction. */
  readonly release: () => void;
}

export interface GitDocumentRevision {
  readonly commitId: string;
  readonly body: string;
  readonly format: DocumentGitFormat;
  readonly styleVersionId: string;
  readonly templateVersionId?: string | undefined;
  readonly actor: DocumentGitActor;
}

export interface GitDocumentHistoryEntry extends Omit<
  GitDocumentRevision,
  "body"
> {
  readonly parentCommitId: string | null;
  readonly committedAt: Date;
}

export class GitDocumentStoreValidationError extends Error {
  constructor() {
    super("Invalid Git document store input");
    this.name = "GitDocumentStoreValidationError";
  }
}

export class GitDocumentNotFoundError extends Error {
  constructor() {
    super("Git document revision was not found");
    this.name = "GitDocumentNotFoundError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const TRAILER_PREFIX = "Document update\n\n";

interface FileSnapshot {
  readonly path: string;
  readonly content: Buffer | undefined;
}

interface ParsedMetadata {
  readonly documentId: string;
  readonly format: DocumentGitFormat;
  readonly styleVersionId: string;
  readonly templateVersionId?: string | undefined;
  readonly actor: DocumentGitActor;
}

/**
 * A filesystem-backed, company-isolated document history. It deliberately has
 * no database or HTTP dependencies so a later adapter can map its local types
 * to document service contracts.
 */
export class CompanyDocumentGitStore {
  private readonly rootDir: string;
  private readonly mutationTails = new Map<string, Promise<void>>();

  constructor(options: CompanyDocumentGitStoreOptions) {
    if (!isAbsolute(options.rootDir)) {
      throw new GitDocumentStoreValidationError();
    }
    this.rootDir = resolve(options.rootDir);
  }

  repositoryPath(workspaceId: string, companyId: string): string {
    validateUuid(workspaceId);
    validateUuid(companyId);
    return join(
      this.rootDir,
      "workspaces",
      workspaceId,
      "companies",
      companyId,
    );
  }

  async checkpoint(
    workspaceId: string,
    companyId: string,
  ): Promise<GitDocumentCheckpoint> {
    const dir = this.repositoryPath(workspaceId, companyId);
    const release = await this.acquireMutationLease(dir);
    let headCommitId: string | null = null;
    try {
      headCommitId = await git.resolveRef({ fs, dir, ref: "main" });
    } catch {
      // A repository is created lazily by the first document write.
    }
    return { workspaceId, companyId, headCommitId, release };
  }

  completeCheckpoint(checkpoint: GitDocumentCheckpoint): void {
    checkpoint.release();
  }

  /** Restores the company repository after its surrounding DB transaction fails. */
  async restoreCheckpoint(
    checkpoint: GitDocumentCheckpoint,
    expectedHeadCommitId?: string,
  ): Promise<void> {
    const dir = this.repositoryPath(
      checkpoint.workspaceId,
      checkpoint.companyId,
    );
    try {
      const currentHead = await git
        .resolveRef({ fs, dir, ref: "main" })
        .catch(() => null);
      const expected = expectedHeadCommitId ?? checkpoint.headCommitId;
      if (currentHead !== expected)
        throw new Error("Git repository advanced during compensation");
      if (checkpoint.headCommitId === null) {
        await rm(dir, { recursive: true, force: true });
        return;
      }
      await git.writeRef({
        fs,
        dir,
        ref: "main",
        value: checkpoint.headCommitId,
        force: true,
      });
      await rm(join(dir, ".git", "index"), { force: true });
      await git.checkout({ fs, dir, ref: "main", force: true });
    } finally {
      checkpoint.release();
    }
  }

  private async acquireMutationLease(key: string): Promise<() => void> {
    const previous = this.mutationTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.mutationTails.set(key, tail);
    await previous;
    return () => {
      if (this.mutationTails.get(key) === tail) this.mutationTails.delete(key);
      release();
    };
  }

  async write(input: WriteDocumentGitInput): Promise<GitDocumentRevision> {
    validateWriteInput(input);
    const dir = this.repositoryPath(input.workspaceId, input.companyId);
    const paths = documentPaths(input.documentId);
    await this.initialize(dir);

    const target = pathForFormat(paths, input.format);
    const previous = [paths.markdown, paths.html, paths.template].filter(
      (path) => path !== target,
    );
    const snapshots = await Promise.all(
      [target, ...previous].map((path) => snapshot(dir, path)),
    );

    try {
      await mkdir(dirname(join(dir, target)), { recursive: true });
      await writeFile(join(dir, target), input.body, "utf8");
      await git.add({ fs, dir, filepath: target });
      for (const path of previous)
        if (await exists(join(dir, path))) {
          await unlink(join(dir, path));
          await git.remove({ fs, dir, filepath: path });
        }

      const commitId = await git.commit({
        fs,
        dir,
        ref: "main",
        message: commitMessage(input),
        author: gitSignature(input.actor),
        committer: gitSignature(input.actor),
      });
      return {
        commitId,
        body: input.body,
        format: input.format,
        styleVersionId: input.styleVersionId,
        ...(input.templateVersionId
          ? { templateVersionId: input.templateVersionId }
          : {}),
        actor: input.actor,
      };
    } catch (error) {
      await this.restore(dir, snapshots);
      throw error;
    }
  }

  async readCurrent(input: ReadDocumentGitInput): Promise<GitDocumentRevision> {
    validateIdentity(input);
    const dir = this.repositoryPath(input.workspaceId, input.companyId);
    const [latest] = await this.history(input);
    if (!latest) throw new GitDocumentNotFoundError();
    return this.readAtCommit(dir, input.documentId, latest.commitId);
  }

  async readHistorical(
    input: ReadHistoricalDocumentGitInput,
  ): Promise<GitDocumentRevision> {
    validateIdentity(input);
    if (!OID.test(input.commitId)) throw new GitDocumentStoreValidationError();
    const dir = this.repositoryPath(input.workspaceId, input.companyId);
    return this.readAtCommit(dir, input.documentId, input.commitId);
  }

  async history(
    input: ReadDocumentGitInput,
  ): Promise<readonly GitDocumentHistoryEntry[]> {
    validateIdentity(input);
    const dir = this.repositoryPath(input.workspaceId, input.companyId);
    const paths = documentPaths(input.documentId);
    // isomorphic-git's filepath traversal is not rename-following when the old
    // path is absent at HEAD. Retain both filepath logs and supplement them with
    // the repository walk, then restrict it by our generated Document-Id trailer.
    const logs = await Promise.all([
      this.logAll(dir),
      this.logPath(dir, paths.markdown),
      this.logPath(dir, paths.html),
      this.logPath(dir, paths.template),
    ]);
    const commits = new Map<
      string,
      Awaited<ReturnType<typeof git.log>>[number]
    >();
    for (const entries of logs) {
      for (const entry of entries) commits.set(entry.oid, entry);
    }
    return [...commits.entries()]
      .map(([commitId, entry]) => {
        const metadata = parseMetadata(entry.commit.message);
        if (!metadata || metadata.documentId !== input.documentId)
          return undefined;
        return {
          commitId,
          format: metadata.format,
          styleVersionId: metadata.styleVersionId,
          ...(metadata.templateVersionId
            ? { templateVersionId: metadata.templateVersionId }
            : {}),
          actor: metadata.actor,
          parentCommitId: entry.commit.parent[0] ?? null,
          committedAt: new Date(entry.commit.committer.timestamp * 1000),
        };
      })
      .filter(
        (entry): entry is NonNullable<typeof entry> => entry !== undefined,
      );
  }

  async revert(input: RevertDocumentGitInput): Promise<GitDocumentRevision> {
    validateIdentity(input);
    validateActor(input.actor);
    if (!OID.test(input.commitId)) throw new GitDocumentStoreValidationError();
    const historical = await this.readHistorical(input);
    return this.write({
      workspaceId: input.workspaceId,
      companyId: input.companyId,
      documentId: input.documentId,
      body: historical.body,
      format: historical.format,
      styleVersionId: historical.styleVersionId,
      ...(historical.templateVersionId
        ? { templateVersionId: historical.templateVersionId }
        : {}),
      actor: input.actor,
    });
  }

  private async initialize(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
    await git.init({ fs, dir, defaultBranch: "main" });
  }

  private async readAtCommit(
    dir: string,
    documentId: string,
    commitId: string,
  ): Promise<GitDocumentRevision> {
    const paths = documentPaths(documentId);
    const metadata = await this.metadataAtCommit(dir, documentId, commitId);
    const path = pathForFormat(paths, metadata.format);
    try {
      const blob = await git.readBlob({
        fs,
        dir,
        oid: commitId,
        filepath: path,
      });
      return {
        commitId,
        body: Buffer.from(blob.blob).toString("utf8"),
        format: metadata.format,
        styleVersionId: metadata.styleVersionId,
        ...(metadata.templateVersionId
          ? { templateVersionId: metadata.templateVersionId }
          : {}),
        actor: metadata.actor,
      };
    } catch {
      throw new GitDocumentNotFoundError();
    }
  }

  private async metadataAtCommit(
    dir: string,
    documentId: string,
    commitId: string,
  ): Promise<ParsedMetadata> {
    try {
      const { commit } = await git.readCommit({ fs, dir, oid: commitId });
      const metadata = parseMetadata(commit.message);
      if (!metadata || metadata.documentId !== documentId)
        throw new GitDocumentNotFoundError();
      return metadata;
    } catch (error) {
      if (error instanceof GitDocumentNotFoundError) throw error;
      throw new GitDocumentNotFoundError();
    }
  }

  private async logPath(dir: string, filepath: string) {
    try {
      return await git.log({ fs, dir, ref: "main", filepath });
    } catch {
      return [];
    }
  }

  private async logAll(dir: string) {
    try {
      return await git.log({ fs, dir, ref: "main" });
    } catch {
      return [];
    }
  }

  private async restore(
    dir: string,
    snapshots: readonly FileSnapshot[],
  ): Promise<void> {
    await Promise.all(
      snapshots.map(async ({ path, content }) => {
        const absolutePath = join(dir, path);
        if (content === undefined) {
          await unlink(absolutePath).catch(() => undefined);
          await git.remove({ fs, dir, filepath: path }).catch(() => undefined);
        } else {
          await mkdir(dirname(absolutePath), { recursive: true });
          await writeFile(absolutePath, content);
          await git.add({ fs, dir, filepath: path });
        }
      }),
    );
  }
}

function validateWriteInput(input: WriteDocumentGitInput): void {
  validateIdentity(input);
  validateUuid(input.styleVersionId);
  validateActor(input.actor);
  if (
    input.format !== "markdown" &&
    input.format !== "html" &&
    input.format !== "template"
  )
    throw new GitDocumentStoreValidationError();
  if (input.format === "template") validateUuid(input.templateVersionId ?? "");
  else if (input.templateVersionId) throw new GitDocumentStoreValidationError();
}

function validateIdentity(input: DocumentGitIdentity): void {
  validateUuid(input.workspaceId);
  validateUuid(input.companyId);
  validateUuid(input.documentId);
}

function validateActor(actor: DocumentGitActor): void {
  if (actor.type === "credential") validateUuid(actor.id);
  else if (actor.type !== "user" || !USER_ID.test(actor.id))
    throw new GitDocumentStoreValidationError();
}

function validateUuid(value: string): void {
  if (!UUID.test(value)) throw new GitDocumentStoreValidationError();
}

function documentPaths(documentId: string): {
  readonly markdown: string;
  readonly html: string;
  readonly template: string;
} {
  validateUuid(documentId);
  const base = `documents/${documentId}/document`;
  return {
    markdown: `${base}.md`,
    html: `${base}.html`,
    template: `${base}.json`,
  };
}

function pathForFormat(
  paths: ReturnType<typeof documentPaths>,
  format: DocumentGitFormat,
): string {
  return format === "markdown"
    ? paths.markdown
    : format === "html"
      ? paths.html
      : paths.template;
}

function commitMessage(input: WriteDocumentGitInput): string {
  const templateTrailer = input.templateVersionId
    ? `
Template-Version-Id: ${input.templateVersionId}`
    : "";
  return `${TRAILER_PREFIX}Document-Id: ${input.documentId}
Style-Version-Id: ${input.styleVersionId}
Format: ${input.format}${templateTrailer}
Actor-Type: ${input.actor.type}
Actor-Id: ${input.actor.id}`;
}

function gitSignature(actor: DocumentGitActor): {
  readonly name: string;
  readonly email: string;
} {
  return {
    name: `hypergendoc-${actor.type}`,
    email: `${actor.id}@hypergendoc.invalid`,
  };
}

function parseMetadata(message: string): ParsedMetadata | undefined {
  if (!message.startsWith(TRAILER_PREFIX)) return undefined;
  const trailers = new Map<string, string>();
  for (const line of message.slice(TRAILER_PREFIX.length).split("\n")) {
    const separator = line.indexOf(": ");
    if (separator > 0)
      trailers.set(line.slice(0, separator), line.slice(separator + 2));
  }
  const documentId = trailers.get("Document-Id");
  const styleVersionId = trailers.get("Style-Version-Id");
  const format = trailers.get("Format");
  const templateVersionId = trailers.get("Template-Version-Id");
  const actorType = trailers.get("Actor-Type");
  const actorId = trailers.get("Actor-Id");
  if (
    !documentId ||
    !styleVersionId ||
    !actorId ||
    (format !== "markdown" && format !== "html" && format !== "template") ||
    (actorType !== "user" && actorType !== "credential")
  )
    return undefined;
  try {
    validateUuid(documentId);
    validateUuid(styleVersionId);
    if (format === "template") validateUuid(templateVersionId ?? "");
    else if (templateVersionId) return undefined;
    validateActor({ type: actorType, id: actorId });
  } catch {
    return undefined;
  }
  return {
    documentId,
    format,
    styleVersionId,
    ...(templateVersionId ? { templateVersionId } : {}),
    actor: { type: actorType, id: actorId },
  };
}

async function snapshot(dir: string, filepath: string): Promise<FileSnapshot> {
  try {
    return { path: filepath, content: await readFile(join(dir, filepath)) };
  } catch {
    return { path: filepath, content: undefined };
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}
