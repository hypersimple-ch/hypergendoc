import { S3Client } from "@aws-sdk/client-s3";
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

  it("stores a private object and produces short-lived authorized access", async () => {
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (
      endpoint === undefined ||
      bucket === undefined ||
      accessKeyId === undefined ||
      secretAccessKey === undefined
    )
      throw new Error(
        "S3 integration requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY",
      );
    const client = new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? "us-east-1",
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
    const store = createPrivateObjectStore(
      createAwsS3ObjectClient(client),
      bucket,
    );
    const object = await store.putPrivate({
      bytes: new TextEncoder().encode("private integration artifact"),
      contentType: "application/octet-stream",
    });
    try {
      const downloaded = await store.authorizedGet({
        key: object.key,
        authorize: () => Promise.resolve(true),
      });
      expect(new TextDecoder().decode(downloaded.bytes)).toBe(
        "private integration artifact",
      );
    } finally {
      await store.delete(object.key);
    }
  });
});
