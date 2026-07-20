import type { DocumentCommit, DocumentSnapshot } from "@hypergendoc/contracts";
import type {
  GitDocumentHistoryEntry,
  GitDocumentRevision,
} from "./git-store.js";

export function toDocumentCommit(
  documentId: string,
  entry: GitDocumentHistoryEntry,
): DocumentCommit {
  return {
    documentId,
    commitSha: entry.commitId,
    parentCommitSha: entry.parentCommitId,
    styleVersionId: entry.styleVersionId,
    format: entry.format,
    createdByType: entry.actor.type,
    createdById: entry.actor.id,
    createdAt: entry.committedAt.toISOString(),
  };
}

export function toDocumentSnapshot(
  documentId: string,
  revision: GitDocumentRevision,
): DocumentSnapshot {
  return {
    documentId,
    commitSha: revision.commitId,
    styleVersionId: revision.styleVersionId,
    format: revision.format,
    body: revision.body,
  };
}
