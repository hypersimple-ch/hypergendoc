import fs from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import * as git from "isomorphic-git";

export type DocumentGitFormat = "markdown" | "html";
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

export interface GitDocumentRevision {
  readonly commitId: string;
  readonly body: string;
  readonly format: DocumentGitFormat;
  readonly styleVersionId: string;
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
  readonly actor: DocumentGitActor;
}

/**
 * A filesystem-backed, company-isolated document history. It deliberately has
 * no database or HTTP dependencies so a later adapter can map its local types
 * to document service contracts.
 */
export class CompanyDocumentGitStore {
  private readonly rootDir: string;

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

  async write(input: WriteDocumentGitInput): Promise<GitDocumentRevision> {
    validateWriteInput(input);
    const dir = this.repositoryPath(input.workspaceId, input.companyId);
    const paths = documentPaths(input.documentId);
    await this.initialize(dir);

    const target = input.format === "markdown" ? paths.markdown : paths.html;
    const previous = input.format === "markdown" ? paths.html : paths.markdown;
    const snapshots = await Promise.all([
      snapshot(dir, target),
      snapshot(dir, previous),
    ]);

    try {
      await mkdir(dirname(join(dir, target)), { recursive: true });
      await writeFile(join(dir, target), input.body, "utf8");
      await git.add({ fs, dir, filepath: target });
      if (await exists(join(dir, previous))) {
        await unlink(join(dir, previous));
        await git.remove({ fs, dir, filepath: previous });
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
          actor: metadata.actor,
          parentCommitId: entry.commit.parent[0] ?? null,
          committedAt: new Date(entry.commit.committer.timestamp * 1000),
        };
      })
      .filter((entry): entry is GitDocumentHistoryEntry => entry !== undefined)
      .sort(
        (left, right) =>
          right.committedAt.getTime() - left.committedAt.getTime(),
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
    const path = metadata.format === "markdown" ? paths.markdown : paths.html;
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
  if (input.format !== "markdown" && input.format !== "html")
    throw new GitDocumentStoreValidationError();
}

function validateIdentity(input: DocumentGitIdentity): void {
  validateUuid(input.workspaceId);
  validateUuid(input.companyId);
  validateUuid(input.documentId);
}

function validateActor(actor: DocumentGitActor): void {
  validateUuid(actor.id);
  if (actor.type !== "user" && actor.type !== "credential") {
    throw new GitDocumentStoreValidationError();
  }
}

function validateUuid(value: string): void {
  if (!UUID.test(value)) throw new GitDocumentStoreValidationError();
}

function documentPaths(documentId: string): {
  readonly markdown: string;
  readonly html: string;
} {
  validateUuid(documentId);
  const base = `documents/${documentId}/document`;
  return { markdown: `${base}.md`, html: `${base}.html` };
}

function commitMessage(input: WriteDocumentGitInput): string {
  return `${TRAILER_PREFIX}Document-Id: ${input.documentId}\nStyle-Version-Id: ${input.styleVersionId}\nFormat: ${input.format}\nActor-Type: ${input.actor.type}\nActor-Id: ${input.actor.id}`;
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
  const actorType = trailers.get("Actor-Type");
  const actorId = trailers.get("Actor-Id");
  if (
    !documentId ||
    !styleVersionId ||
    !actorId ||
    (format !== "markdown" && format !== "html") ||
    (actorType !== "user" && actorType !== "credential")
  )
    return undefined;
  try {
    validateUuid(documentId);
    validateUuid(styleVersionId);
    validateUuid(actorId);
  } catch {
    return undefined;
  }
  return {
    documentId,
    format,
    styleVersionId,
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
