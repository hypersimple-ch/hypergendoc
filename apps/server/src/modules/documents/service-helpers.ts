import { createHash } from "node:crypto";
import type { ActorContext } from "../../platform/context.js";
import { AppError } from "../../platform/errors.js";
import {
  GitDocumentNotFoundError,
  GitDocumentStoreValidationError,
} from "./git-store.js";

export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

export const actorId = (actor: ActorContext) =>
  actor.type === "human" ? actor.userId : actor.credentialId;

export const actorType = (actor: ActorContext) =>
  actor.type === "human" ? ("user" as const) : ("credential" as const);

export function requireActor(
  actor: ActorContext | undefined,
): asserts actor is ActorContext {
  if (!actor) throw new AppError("unauthenticated", 401);
}

export function requireAction(
  actor: ActorContext,
  action: "documents:read" | "documents:write",
  companyId: string,
): void {
  if (
    actor.type === "agent" &&
    (!actor.actions.includes(action) ||
      !actor.allowedCompanyIds.includes(companyId))
  )
    throw new AppError("not_found", 404);
}

export const invalid = () => new AppError("validation_failed", 400);
export const notFound = () => new AppError("not_found", 404);

export function mapGitError(error: unknown): never {
  if (error instanceof GitDocumentStoreValidationError) throw invalid();
  if (error instanceof GitDocumentNotFoundError) throw notFound();
  throw new AppError("internal_error", 500);
}
