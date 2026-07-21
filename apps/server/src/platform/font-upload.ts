import { createRequire } from "node:module";
import { limits } from "@hypergendoc/config";

const fontkit = createRequire(import.meta.url)("fontkit") as {
  create(bytes: Uint8Array): unknown;
};
import type { ObjectStore, StoredObject } from "./object-store.js";
import { AppError } from "./errors.js";

const maxMetadataLength = 255;

function fontContentType(bytes: Uint8Array): string | undefined {
  const header = Buffer.from(bytes.subarray(0, 4)).toString("ascii");
  if (header === "OTTO") return "font/otf";
  if (header === "wOF2") return "font/woff2";
  if (Buffer.from(bytes.subarray(0, 4)).equals(Buffer.from([0, 1, 0, 0])))
    return "font/ttf";
  return undefined;
}

function safeName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  if (
    !name ||
    name.length > maxMetadataLength ||
    [...name].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  )
    return undefined;
  return name;
}

export interface FontOwnershipInput {
  readonly workspaceId: string;
  readonly companyId: string;
  readonly objectKey: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly contentType: string;
  readonly displayName: string;
  readonly familyName: string;
  readonly subfamilyName: string | null;
}
export interface FontOwnershipRepository {
  create(input: FontOwnershipInput): Promise<{ readonly id: string }>;
}
export interface FontUploadResult extends StoredObject {
  readonly id: string;
  readonly familyName: string;
  readonly subfamilyName: string | null;
  readonly displayName: string;
}

/** Validates a single supported font container and persists its immutable ownership lineage. */
export async function uploadFont(
  input: Readonly<{
    workspaceId: string;
    companyId: string;
    bytes: Uint8Array;
  }>,
  store: ObjectStore,
  ownership: FontOwnershipRepository,
): Promise<FontUploadResult> {
  if (input.bytes.byteLength > limits.fontBytes)
    throw new AppError("validation_failed", 400);
  const contentType = fontContentType(input.bytes);
  if (!contentType) throw new AppError("validation_failed", 400);

  let parsed: {
    familyName?: unknown;
    subfamilyName?: unknown;
    fullName?: unknown;
  };
  try {
    parsed = fontkit.create(Buffer.from(input.bytes)) as typeof parsed;
  } catch {
    throw new AppError("validation_failed", 400);
  }
  const familyName = safeName(parsed.familyName);
  const subfamilyName = safeName(parsed.subfamilyName) ?? null;
  const displayName = safeName(parsed.fullName) ?? familyName;
  if (!familyName || !displayName) throw new AppError("validation_failed", 400);

  const object = await store.putPrivate({
    bytes: input.bytes,
    contentType,
    metadata: { kind: "font" },
  });
  try {
    const record = await ownership.create({
      workspaceId: input.workspaceId,
      companyId: input.companyId,
      objectKey: object.key,
      sha256: object.sha256,
      bytes: object.bytes,
      contentType,
      displayName,
      familyName,
      subfamilyName,
    });
    return { ...object, ...record, familyName, subfamilyName, displayName };
  } catch (error) {
    try {
      await store.delete(object.key);
    } catch {
      /* private orphan cleanup may retry */
    }
    throw error;
  }
}
