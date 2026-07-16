import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  createAwsS3ObjectClient,
  createPrivateObjectStore,
} from "./object-store.js";

const enabled = process.env.RUN_PLATFORM_INTEGRATION === "true";

describe.skipIf(!enabled)("platform service integrations", () => {
  it("rolls back a PostgreSQL transaction", async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "CREATE TEMP TABLE platform_rollback_test (id integer)",
      );
      await client.query("INSERT INTO platform_rollback_test VALUES (1)");
      await client.query("ROLLBACK");
      await expect(
        client.query("SELECT * FROM platform_rollback_test"),
      ).rejects.toThrow();
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("stores private Garage objects with metadata and rejects anonymous reads", async () => {
    const endpoint = process.env.S3_ENDPOINT ?? "http://127.0.0.1:19000";
    const bucket = process.env.S3_BUCKET;
    const accessKeyId =
      process.env.S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY;
    const secretAccessKey =
      process.env.S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_KEY;
    if (
      bucket === undefined ||
      accessKeyId === undefined ||
      secretAccessKey === undefined
    )
      throw new Error(
        "S3 integration requires S3_BUCKET plus S3_ACCESS_KEY_ID/S3_ACCESS_KEY and S3_SECRET_ACCESS_KEY/S3_SECRET_KEY",
      );
    const client = new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? "garage",
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
    const store = createPrivateObjectStore(
      createAwsS3ObjectClient(client),
      bucket,
    );
    const bytes = new TextEncoder().encode("private integration artifact");
    const object = await store.putPrivate({
      bytes,
      contentType: "text/plain",
      metadata: { "test-marker": "garage" },
    });
    try {
      const downloaded = await store.authorizedGet({
        key: object.key,
        authorize: () => Promise.resolve(true),
      });
      expect(downloaded).toEqual({ bytes, contentType: "text/plain" });
      await expect(
        client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: object.key,
          }),
        ),
      ).resolves.toMatchObject({
        ContentType: "text/plain",
        Metadata: { "test-marker": "garage", sha256: object.sha256 },
      });
      const response = await fetch(
        new URL(
          `${encodeURIComponent(bucket)}/${object.key
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`,
          endpoint.endsWith("/") ? endpoint : `${endpoint}/`,
        ),
      );
      expect([401, 403]).toContain(response.status);
    } finally {
      await store.delete(object.key);
    }
    await expect(
      client.send(new HeadObjectCommand({ Bucket: bucket, Key: object.key })),
    ).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
  });
});
