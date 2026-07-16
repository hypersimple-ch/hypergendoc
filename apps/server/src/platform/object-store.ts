import { createHash, randomBytes } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
export interface StoredObject {
  readonly key: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly contentType: string;
}
export interface ObjectStore {
  putPrivate(input: {
    readonly bytes: Uint8Array;
    readonly contentType: string;
    readonly metadata?: Readonly<Record<string, string>>;
  }): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  authorizedGet(input: {
    readonly key: string;
    readonly authorize: () => Promise<boolean>;
  }): Promise<Readonly<{ bytes: Uint8Array; contentType: string }>>;
}
export interface S3ObjectClient {
  put(input: {
    bucket: string;
    key: string;
    body: Uint8Array;
    contentType: string;
    metadata: Readonly<Record<string, string>>;
  }): Promise<void>;
  delete(input: { bucket: string; key: string }): Promise<void>;
  get(input: {
    bucket: string;
    key: string;
  }): Promise<Readonly<{ bytes: Uint8Array; contentType: string }>>;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function safeMetadata(
  metadata: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata ?? {})
      .filter(
        ([key, value]) => /^[a-z0-9-]{1,64}$/i.test(key) && value.length <= 256,
      )
      .map(([key, value]) => [key.toLowerCase(), value.replace(/[\r\n]/g, "")]),
  );
}
export function createPrivateObjectStore(
  client: S3ObjectClient,
  bucket: string,
  random: (size: number) => Uint8Array = randomBytes,
): ObjectStore {
  return {
    async putPrivate(input) {
      const hash = sha256(input.bytes);
      const key = `private/${Buffer.from(random(24)).toString("hex")}`;
      await client.put({
        bucket,
        key,
        body: input.bytes,
        contentType: input.contentType,
        metadata: { ...safeMetadata(input.metadata), sha256: hash },
      });
      return {
        key,
        sha256: hash,
        bytes: input.bytes.byteLength,
        contentType: input.contentType,
      };
    },
    delete: async (key) => client.delete({ bucket, key }),
    authorizedGet: async ({ key, authorize }) => {
      if (!(await authorize())) throw new Error("Object access denied");
      return client.get({ bucket, key });
    },
  };
}
export function createAwsS3ObjectClient(client: S3Client): S3ObjectClient {
  return {
    put: async (input) => {
      await client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          Metadata: input.metadata,
        }),
      );
    },
    delete: async (input) => {
      await client.send(
        new DeleteObjectCommand({ Bucket: input.bucket, Key: input.key }),
      );
    },
    get: async (input) => {
      const response = await client.send(
        new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
      );
      if (!response.Body) throw new Error("Object body is missing");
      return {
        bytes: await response.Body.transformToByteArray(),
        contentType: response.ContentType ?? "application/octet-stream",
      };
    },
  };
}
