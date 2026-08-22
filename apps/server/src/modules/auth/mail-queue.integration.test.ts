import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@hypergendoc/db";
import type { Database } from "@hypergendoc/db";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMailJobRepository } from "./mail-queue.js";

const databaseUrl = process.env.HYPERGENDOC_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
let pool: Pool | undefined;

integration("PostgreSQL mail job repository", () => {
  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("claims atomically, recovers leases, and erases terminal URLs", async () => {
    const client = await pool!.connect();
    const namespace = `mail_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.query(`CREATE SCHEMA "${namespace}"`);
      await client.query(`SET search_path TO "${namespace}", public`);
      const migration = await readFile(
        new URL(
          "../../../../../packages/db/migrations/0006_durable_mail.sql",
          import.meta.url,
        ),
        "utf8",
      );
      for (const statement of migration
        .split("--> statement-breakpoint")
        .map((part) => part.trim())
        .filter(Boolean))
        await client.query(statement);
      const database = drizzle({ client, schema }) as unknown as Database;
      const repository = createMailJobRepository(database);
      await repository.enqueue({
        kind: "password_reset",
        recipient: "queue-test@example.test",
        recipientName: "Queue Test",
        url: "https://example.test/reset/single-use",
      });
      const now = new Date();
      const [claimed] = await repository.claim({
        now,
        leaseUntil: new Date(now.getTime() + 1),
        limit: 1,
      });
      expect(claimed).toMatchObject({ kind: "password_reset", attempts: 1 });
      expect(
        await repository.claim({
          now,
          leaseUntil: new Date(now.getTime() + 1),
          limit: 1,
        }),
      ).toEqual([]);
      expect(await repository.recoverExpired(new Date(now.getTime() + 2))).toBe(
        1,
      );
      const [reclaimed] = await repository.claim({
        now: new Date(now.getTime() + 2),
        leaseUntil: new Date(now.getTime() + 1000),
        limit: 1,
      });
      await repository.markFailed({
        id: reclaimed!.id,
        leaseToken: reclaimed!.leaseToken,
        retryAt: now,
        failedAt: now,
        terminal: true,
        errorCode: "transport_failed",
      });
      const result = await client.query<{
        status: string;
        single_use_url: string | null;
      }>("SELECT status, single_use_url FROM mail_jobs");
      expect(result.rows[0]).toEqual({ status: "dead", single_use_url: null });
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
      client.release();
    }
  });
});
