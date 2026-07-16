import { fileTypeFromBuffer } from "file-type";
import { limits } from "@hypergendoc/config";
import type { ObjectStore, StoredObject } from "./object-store.js";
import { AppError } from "./errors.js";

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function hasExactContainerLength(
  bytes: Uint8Array,
  contentType: string,
): boolean {
  const data = Buffer.from(bytes);
  if (contentType === "image/jpeg")
    return data.length >= 4 && data.at(-2) === 0xff && data.at(-1) === 0xd9;
  if (contentType === "image/webp")
    return data.length >= 12 && data.readUInt32LE(4) + 8 === data.length;
  if (contentType !== "image/png" || data.length < 20) return false;
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > data.length) return false;
    const type = data.toString("ascii", offset + 4, offset + 8);
    if (type === "IEND") return length === 0 && end === data.length;
    offset = end;
  }
  return false;
}

export interface LogoOwnershipInput {
  readonly workspaceId: string;
  readonly companyId: string;
  readonly objectKey: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly contentType: "image/png" | "image/jpeg" | "image/webp";
}
export interface LogoOwnershipRepository {
  create(input: LogoOwnershipInput): Promise<{ readonly id: string }>;
}
export interface LogoUpload {
  readonly workspaceId: string;
  readonly companyId: string;
  readonly bytes: Uint8Array;
}
export interface LogoUploadResult extends StoredObject {
  readonly id: string;
}

/** Detects content from magic bytes; client names and declared MIME types are intentionally ignored. */
export async function uploadLogo(
  upload: LogoUpload,
  store: ObjectStore,
  ownership: LogoOwnershipRepository,
): Promise<LogoUploadResult> {
  if (upload.bytes.byteLength > limits.logoBytes)
    throw new AppError("validation_failed", 400);
  const detected = await fileTypeFromBuffer(upload.bytes);
  if (
    detected === undefined ||
    !allowedTypes.has(detected.mime) ||
    !hasExactContainerLength(upload.bytes, detected.mime)
  )
    throw new AppError("validation_failed", 400);
  const contentType = detected.mime as LogoOwnershipInput["contentType"];
  const object = await store.putPrivate({
    bytes: upload.bytes,
    contentType,
    metadata: { kind: "logo" },
  });
  try {
    const record = await ownership.create({
      workspaceId: upload.workspaceId,
      companyId: upload.companyId,
      objectKey: object.key,
      sha256: object.sha256,
      bytes: object.bytes,
      contentType,
    });
    return { ...object, id: record.id };
  } catch (error) {
    try {
      await store.delete(object.key);
    } catch {
      /* the object is private; asynchronous cleanup may retry */
    }
    throw error;
  }
}
