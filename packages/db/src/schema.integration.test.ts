import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const databaseUrl = process.env.HYPERGENDOC_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
let pool: Pool | undefined;

integration("Git document history migration schema", () => {
  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("preserves styles and logos while removing render-history storage", async () => {
    const client = await pool!.connect();
    const workspace = randomUUID();
    const company = randomUUID();
    const style = randomUUID();
    const version = randomUUID();
    const logo = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO workspaces (id, name) VALUES ($1, 'migration')",
        [workspace],
      );
      await client.query(
        "INSERT INTO companies (id, workspace_id, name) VALUES ($1, $2, 'company')",
        [company, workspace],
      );
      await client.query(
        "INSERT INTO styles (id, workspace_id, company_id, name) VALUES ($1, $2, $3, 'style')",
        [style, workspace, company],
      );
      await client.query(
        "INSERT INTO style_versions (id, workspace_id, style_id, version, definition) VALUES ($1, $2, $3, 1, '{}'::jsonb)",
        [version, workspace, style],
      );
      await client.query(
        "UPDATE styles SET active_version_id = $1 WHERE id = $2",
        [version, style],
      );
      await client.query(
        "INSERT INTO stored_objects (id, workspace_id, company_id, purpose, object_key, content_type, byte_size, sha256) VALUES ($1, $2, $3, 'logo', $4, 'image/svg+xml', 1, $5)",
        [logo, workspace, company, `logo-${logo}`, "a".repeat(64)],
      );

      expect(
        (
          await client.query<{ active_version_id: string | null }>(
            "SELECT active_version_id FROM styles WHERE id = $1",
            [style],
          )
        ).rows[0]?.active_version_id,
      ).toBe(version);
      expect(
        (
          await client.query<{ purpose: string }>(
            "SELECT purpose FROM stored_objects WHERE id = $1",
            [logo],
          )
        ).rows[0]?.purpose,
      ).toBe("logo");
      await expect(
        client.query(
          "INSERT INTO stored_objects (workspace_id, company_id, purpose, object_key, content_type, byte_size, sha256) VALUES ($1, $2, 'source', $3, 'text/plain', 1, $4)",
          [workspace, company, `source-${randomUUID()}`, "b".repeat(64)],
        ),
      ).rejects.toThrow();

      const removed = await client.query(
        "SELECT to_regclass('public.document_versions') AS versions, to_regclass('public.render_records') AS renders, to_regclass('public.audit_events') IS NOT NULL AS audit_events, to_regclass('public.deletion_jobs') IS NOT NULL AS deletion_jobs, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'current_version_id') AS pointer, EXISTS (SELECT 1 FROM pg_type WHERE typname IN ('document_format', 'render_status')) AS retired_enum",
      );
      expect(removed.rows[0]).toEqual({
        versions: null,
        renders: null,
        audit_events: true,
        deletion_jobs: true,
        pointer: false,
        retired_enum: false,
      });
      await client.query("ROLLBACK");
    } finally {
      try {
        await client.query("ROLLBACK");
      } catch {
        // No active transaction.
      }
      client.release();
    }
  });
});
