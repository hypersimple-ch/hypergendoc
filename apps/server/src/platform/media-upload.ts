import { fileTypeFromBuffer } from "file-type";
import { limits } from "@hypergendoc/config";
import type { ObjectStore, StoredObject } from "./object-store.js";
import { uploadValidationError } from "./errors.js";

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
function exact(bytes: Uint8Array, contentType: string): boolean {
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
    if (data.toString("ascii", offset + 4, offset + 8) === "IEND")
      return length === 0 && end === data.length;
    offset = end;
  }
  return false;
}
export interface ImageOwnershipRepository {
  createImage(
    input: Readonly<{
      workspaceId: string;
      companyId: string;
      objectKey: string;
      sha256: string;
      bytes: number;
      contentType: "image/png" | "image/jpeg" | "image/webp";
      displayName?: string | undefined;
    }>,
  ): Promise<{ readonly id: string }>;
}
export async function uploadImage(
  upload: Readonly<{
    workspaceId: string;
    companyId: string;
    bytes: Uint8Array;
    displayName?: string | undefined;
  }>,
  store: ObjectStore,
  ownership: ImageOwnershipRepository,
): Promise<StoredObject & { readonly id: string }> {
  if (upload.bytes.byteLength > limits.logoBytes)
    throw uploadValidationError("Choose a file smaller than 10 MiB.", 413);
  const detected = await fileTypeFromBuffer(upload.bytes);
  if (
    !detected ||
    !allowedTypes.has(detected.mime) ||
    !exact(upload.bytes, detected.mime)
  )
    throw uploadValidationError("Choose a PNG, JPEG, or WebP image.");
  const contentType = detected.mime as
    "image/png" | "image/jpeg" | "image/webp";
  const object = await store.putPrivate({
    bytes: upload.bytes,
    contentType,
    metadata: { kind: "template-image" },
  });
  try {
    const record = await ownership.createImage({
      workspaceId: upload.workspaceId,
      companyId: upload.companyId,
      objectKey: object.key,
      sha256: object.sha256,
      bytes: object.bytes,
      contentType,
      ...(upload.displayName ? { displayName: upload.displayName } : {}),
    });
    return { ...object, id: record.id };
  } catch (error) {
    await store.delete(object.key).catch(() => undefined);
    throw error;
  }
}
