import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const databaseUrl = process.env.HYPERGENDOC_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
let pool: Pool | undefined;

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function applyMigration(
  client: PoolClient,
  schema: string,
  filename: string,
) {
  const sql = await readFile(
    new URL(`../migrations/${filename}`, import.meta.url),
    "utf8",
  );
  const statements = sql
    .replaceAll('"public"', quoteIdentifier(schema))
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await client.query(statement);
  }
}

async function beginInSchema(client: PoolClient, schema: string) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('search_path', $1, true)", [
    `${quoteIdentifier(schema)}, public`,
  ]);
}

integration("Git document history migration", () => {
  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("discards ready document artifacts without affecting styles or logos", async () => {
    const client = await pool!.connect();
    const schema = `migration_${randomUUID().replaceAll("-", "")}`;
    const workspace = randomUUID();
    const company = randomUUID();
    const style = randomUUID();
    const styleVersion = randomUUID();
    const document = randomUUID();
    const documentVersion = randomUUID();
    const renderRecord = randomUUID();
    const source = randomUUID();
    const pdf = randomUUID();
    const logo = randomUUID();
    const user = `migration-${randomUUID()}`;
    const inputHash = "a".repeat(64);
    const sourceHash = "b".repeat(64);
    const outputHash = "c".repeat(64);

    try {
      await client.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);

      await beginInSchema(client, schema);
      await applyMigration(client, schema, "0000_ambitious_blink.sql");
      await applyMigration(
        client,
        schema,
        "0001_replace_document_pipeline.sql",
      );
      await client.query("COMMIT");

      await beginInSchema(client, schema);
      await client.query(
        "INSERT INTO workspaces (id, name) VALUES ($1, 'migration')",
        [workspace],
      );
      await client.query(
        "INSERT INTO companies (id, workspace_id, name) VALUES ($1, $2, 'company')",
        [company, workspace],
      );
      await client.query(
        "INSERT INTO \"user\" (id, name, email) VALUES ($1, 'Migration User', $2)",
        [user, `${user}@example.test`],
      );
      await client.query(
        "INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
        [workspace, user],
      );
      await client.query(
        "INSERT INTO styles (id, workspace_id, company_id, name) VALUES ($1, $2, $3, 'style')",
        [style, workspace, company],
      );
      await client.query(
        "INSERT INTO style_versions (id, workspace_id, style_id, version, definition) VALUES ($1, $2, $3, 1, '{}'::jsonb)",
        [styleVersion, workspace, style],
      );
      await client.query(
        "UPDATE styles SET active_version_id = $1 WHERE id = $2",
        [styleVersion, style],
      );
      await client.query(
        "INSERT INTO stored_objects (id, workspace_id, company_id, purpose, object_key, content_type, byte_size, sha256) VALUES ($1, $2, $3, 'logo', $4, 'image/svg+xml', 1, $5)",
        [logo, workspace, company, `logo-${logo}`, "d".repeat(64)],
      );
      await client.query(
        "INSERT INTO stored_objects (id, workspace_id, company_id, purpose, object_key, content_type, byte_size, sha256) VALUES ($1, $2, $3, 'source', $4, 'text/plain', 1, $5), ($6, $2, $3, 'pdf', $7, 'application/pdf', 1, $8)",
        [
          source,
          workspace,
          company,
          `source-${source}`,
          sourceHash,
          pdf,
          `pdf-${pdf}`,
          outputHash,
        ],
      );
      await client.query(
        "INSERT INTO documents (id, workspace_id, company_id, title) VALUES ($1, $2, $3, 'document')",
        [document, workspace, company],
      );
      await client.query(
        "INSERT INTO document_versions (id, workspace_id, document_id, version, style_version_id, format, body, input_hash, source_hash, output_hash, source_object_id, pdf_object_id, renderer_version, status, created_by_actor_type, created_by_actor_id) VALUES ($1, $2, $3, 1, $4, 'markdown', 'body', $5, $6, $7, $8, $9, 'renderer', 'ready', 'user', $10)",
        [
          documentVersion,
          workspace,
          document,
          styleVersion,
          inputHash,
          sourceHash,
          outputHash,
          source,
          pdf,
          user,
        ],
      );
      await client.query(
        "UPDATE documents SET current_version_id = $1 WHERE id = $2",
        [documentVersion, document],
      );
      await client.query(
        "INSERT INTO render_records (id, workspace_id, document_version_id, status, renderer_version, input_hash, source_hash, output_hash) VALUES ($1, $2, $3, 'ready', 'renderer', $4, $5, $6)",
        [
          renderRecord,
          workspace,
          documentVersion,
          inputHash,
          sourceHash,
          outputHash,
        ],
      );
      await client.query("COMMIT");

      await beginInSchema(client, schema);
      await applyMigration(client, schema, "0002_git_document_history.sql");
      await client.query("COMMIT");

      await beginInSchema(client, schema);
      const result = await client.query<{
        documents: number;
        discardedObjects: number;
        styleVersion: string | null;
        logo: string | null;
      }>(
        'SELECT (SELECT count(*)::int FROM documents WHERE id = $1) AS documents, (SELECT count(*)::int FROM stored_objects WHERE id = ANY($2::uuid[])) AS "discardedObjects", (SELECT active_version_id FROM styles WHERE id = $3) AS "styleVersion", (SELECT purpose::text FROM stored_objects WHERE id = $4) AS logo',
        [document, [source, pdf], style, logo],
      );
      expect(result.rows[0]).toEqual({
        documents: 0,
        discardedObjects: 0,
        styleVersion,
        logo: "logo",
      });
      await client.query("ROLLBACK");
    } finally {
      try {
        await client.query("ROLLBACK");
      } catch {
        // No active transaction.
      }
      try {
        await client.query(
          `DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`,
        );
      } finally {
        client.release();
      }
    }
  });
});
