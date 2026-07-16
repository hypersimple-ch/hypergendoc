import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const databaseUrl = process.env.HYPERGENDOC_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
let pool: Pool | undefined;

integration(
  "PostgreSQL schema (requires an already migrated isolated test database)",
  () => {
    beforeAll(() => {
      pool = new Pool({ connectionString: databaseUrl });
    });
    afterAll(async () => {
      await pool?.end();
    });

    it("rejects cross-workspace lineage and rolls failed work back", async () => {
      const client = await pool!.connect();
      const workspaceA = randomUUID();
      const workspaceB = randomUUID();
      const companyB = randomUUID();
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO workspaces (id, name) VALUES ($1, 'a'), ($2, 'b')",
          [workspaceA, workspaceB],
        );
        await client.query(
          "INSERT INTO companies (id, workspace_id, name) VALUES ($1, $2, 'company-b')",
          [companyB, workspaceB],
        );
        await expect(
          client.query(
            "INSERT INTO styles (id, workspace_id, company_id, name) VALUES ($1, $2, $3, 'cross-tenant')",
            [randomUUID(), workspaceA, companyB],
          ),
        ).rejects.toThrow();
        await client.query("ROLLBACK");
        const result = await client.query(
          "SELECT id FROM workspaces WHERE id = $1",
          [workspaceA],
        );
        expect(result.rowCount).toBe(0);
      } finally {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* no active transaction */
        }
        client.release();
      }
    });

    it("enforces the document version render lifecycle and pointer lineage", async () => {
      const client = await pool!.connect();
      const workspace = randomUUID();
      const otherWorkspace = randomUUID();
      const company = randomUUID();
      const otherCompany = randomUUID();
      const style = randomUUID();
      const styleVersion = randomUUID();
      const document = randomUUID();
      const siblingDocument = randomUUID();
      const otherDocument = randomUUID();
      const readyVersion = randomUUID();
      const failedVersion = randomUUID();
      const siblingVersion = randomUUID();
      const sourceObject = randomUUID();
      const pdfObject = randomUUID();
      const wrongSourceObject = randomUUID();
      const wrongPurposeObject = randomUUID();
      const user = `user-${randomUUID()}`;
      const inputHash = "a".repeat(64);
      const sourceHash = "b".repeat(64);
      const outputHash = "c".repeat(64);
      const reject = async (operation: () => Promise<unknown>) => {
        await client.query("SAVEPOINT expected_failure");
        await expect(operation()).rejects.toThrow();
        await client.query("ROLLBACK TO SAVEPOINT expected_failure");
      };
      const insertPending = async (
        id: string,
        documentId: string,
        version: number,
      ) => {
        await client.query(
          "INSERT INTO document_versions (id, workspace_id, document_id, version, style_version_id, normalized_body, normalized_input_hash, created_by_actor_type, created_by_actor_id) VALUES ($1, $2, $3, $4, $5, 'normalized body', $6, 'user', $7)",
          [id, workspace, documentId, version, styleVersion, inputHash, user],
        );
      };
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO workspaces (id, name) VALUES ($1, 'lifecycle'), ($2, 'other')",
          [workspace, otherWorkspace],
        );
        await client.query(
          "INSERT INTO companies (id, workspace_id, name) VALUES ($1, $2, 'company'), ($3, $2, 'other-company')",
          [company, workspace, otherCompany],
        );
        await client.query(
          "INSERT INTO companies (workspace_id, name) VALUES ($1, 'other-workspace-company')",
          [otherWorkspace],
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
          'INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)',
          [user, "Creator", `${user}@example.test`],
        );
        await client.query(
          "INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
          [workspace, user],
        );
        await client.query(
          "INSERT INTO documents (id, workspace_id, company_id, title) VALUES ($1, $2, $3, 'document'), ($4, $2, $3, 'sibling')",
          [document, workspace, company, siblingDocument],
        );
        await client.query(
          "INSERT INTO documents (id, workspace_id, company_id, title) SELECT $1, $2, id, 'other document' FROM companies WHERE workspace_id = $2",
          [otherDocument, otherWorkspace],
        );
        await client.query(
          "INSERT INTO stored_objects (id, workspace_id, company_id, purpose, object_key, content_type, byte_size, sha256) VALUES ($1, $2, $3, 'source', $4, 'text/plain', 1, $5), ($6, $2, $3, 'pdf', $7, 'application/pdf', 1, $8), ($9, $2, $10, 'source', $11, 'text/plain', 1, $5), ($12, $2, $3, 'pdf', $13, 'application/pdf', 1, $5)",
          [
            sourceObject,
            workspace,
            company,
            `source-${randomUUID()}`,
            sourceHash,
            pdfObject,
            `pdf-${randomUUID()}`,
            outputHash,
            wrongSourceObject,
            otherCompany,
            `wrong-source-${randomUUID()}`,
            wrongPurposeObject,
            `wrong-purpose-${randomUUID()}`,
          ],
        );

        await insertPending(readyVersion, document, 1);
        await insertPending(failedVersion, document, 2);
        await insertPending(siblingVersion, siblingDocument, 1);

        await reject(() =>
          client.query(
            "UPDATE document_versions SET id = $1, version = 99, normalized_body = 'rewritten' WHERE id = $2",
            [randomUUID(), readyVersion],
          ),
        );
        await reject(() =>
          client.query(
            "UPDATE document_versions SET status = 'ready' WHERE id = $1",
            [readyVersion],
          ),
        );
        await reject(() =>
          client.query(
            "UPDATE document_versions SET status = 'ready', source_hash = $1, output_hash = $2, renderer_version = 'renderer@1', source_object_id = $3, pdf_object_id = $4 WHERE id = $5",
            [
              sourceHash,
              outputHash,
              wrongSourceObject,
              pdfObject,
              readyVersion,
            ],
          ),
        );
        await reject(() =>
          client.query(
            "UPDATE document_versions SET status = 'ready', source_hash = $1, output_hash = $2, renderer_version = 'renderer@1', source_object_id = $3, pdf_object_id = $4 WHERE id = $5",
            [
              sourceHash,
              outputHash,
              wrongPurposeObject,
              pdfObject,
              readyVersion,
            ],
          ),
        );
        await client.query(
          "UPDATE document_versions SET status = 'ready', source_hash = $1, output_hash = $2, renderer_version = 'renderer@1', source_object_id = $3, pdf_object_id = $4 WHERE id = $5",
          [sourceHash, outputHash, sourceObject, pdfObject, readyVersion],
        );
        await reject(() =>
          client.query(
            "UPDATE document_versions SET safe_diagnostics = '{\"changed\":true}'::jsonb WHERE id = $1",
            [readyVersion],
          ),
        );
        await reject(() =>
          client.query(
            "UPDATE document_versions SET status = 'failed', renderer_version = 'renderer@2', safe_diagnostics = '{\"error\":true}'::jsonb WHERE id = $1",
            [readyVersion],
          ),
        );

        await client.query(
          "UPDATE document_versions SET status = 'failed', renderer_version = 'renderer@1', safe_diagnostics = '{\"reason\":\"safe\"}'::jsonb WHERE id = $1",
          [failedVersion],
        );
        await reject(() =>
          client.query(
            "UPDATE document_versions SET source_object_id = $1 WHERE id = $2",
            [sourceObject, failedVersion],
          ),
        );

        await client.query(
          "INSERT INTO render_records (workspace_id, document_version_id, status, renderer_version, normalized_input_hash, source_hash, output_hash) VALUES ($1, $2, 'ready', 'renderer@1', $3, $4, $5)",
          [workspace, readyVersion, inputHash, sourceHash, outputHash],
        );
        await client.query(
          "INSERT INTO render_records (workspace_id, document_version_id, status, renderer_version, normalized_input_hash, safe_diagnostics) VALUES ($1, $2, 'failed', 'renderer@1', $3, '{\"reason\":\"safe\"}'::jsonb)",
          [workspace, failedVersion, inputHash],
        );
        await reject(() =>
          client.query(
            "UPDATE render_records SET safe_diagnostics = '{\"changed\":true}'::jsonb WHERE document_version_id = $1",
            [readyVersion],
          ),
        );

        await client.query(
          "UPDATE documents SET current_version_id = $1 WHERE id = $2",
          [readyVersion, document],
        );
        await reject(() =>
          client.query(
            "UPDATE documents SET current_version_id = $1 WHERE id = $2",
            [siblingVersion, document],
          ),
        );
        await reject(() =>
          client.query(
            "UPDATE documents SET current_version_id = $1 WHERE id = $2",
            [readyVersion, otherDocument],
          ),
        );
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });

    it("keeps style versions immutable", async () => {
      const client = await pool!.connect();
      const workspace = randomUUID();
      const company = randomUUID();
      const style = randomUUID();
      const version = randomUUID();
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO workspaces (id, name) VALUES ($1, 'immutable')",
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
        await expect(
          client.query(
            "UPDATE style_versions SET definition = '{\"changed\":true}'::jsonb WHERE id = $1",
            [version],
          ),
        ).rejects.toThrow();
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });

    it("requires a transaction-local purge flag for immutable delete cascades", async () => {
      const client = await pool!.connect();
      const workspace = randomUUID();
      const company = randomUUID();
      const style = randomUUID();
      const styleVersion = randomUUID();
      const document = randomUUID();
      const documentVersion = randomUUID();
      const renderRecord = randomUUID();
      const auditEvent = randomUUID();
      const user = `purge-test-${randomUUID()}`;
      let purged = false;
      try {
        await client.query(
          "INSERT INTO workspaces (id, name) VALUES ($1, 'purge')",
          [workspace],
        );
        await client.query(
          "INSERT INTO companies (id, workspace_id, name) VALUES ($1, $2, 'company')",
          [company, workspace],
        );
        await client.query(
          'INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)',
          [user, "Purge Test", `${user}@example.test`],
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
          "INSERT INTO documents (id, workspace_id, company_id, title) VALUES ($1, $2, $3, 'document')",
          [document, workspace, company],
        );
        await client.query(
          "INSERT INTO document_versions (id, workspace_id, document_id, version, style_version_id, normalized_body, normalized_input_hash, created_by_actor_type, created_by_actor_id) VALUES ($1, $2, $3, 1, $4, 'normalized body', $5, 'user', $6)",
          [
            documentVersion,
            workspace,
            document,
            styleVersion,
            "a".repeat(64),
            user,
          ],
        );
        await client.query(
          "INSERT INTO render_records (id, workspace_id, document_version_id, status, normalized_input_hash) VALUES ($1, $2, $3, 'pending', $4)",
          [renderRecord, workspace, documentVersion, "a".repeat(64)],
        );
        await client.query(
          "INSERT INTO audit_events (id, workspace_id, actor_type, action, target_type, request_id, outcome) VALUES ($1, $2, 'user', 'purge.test', 'workspace', $3, 'success')",
          [auditEvent, workspace, randomUUID()],
        );

        await expect(
          client.query("DELETE FROM style_versions WHERE id = $1", [
            styleVersion,
          ]),
        ).rejects.toThrow("style versions are immutable");
        await expect(
          client.query("DELETE FROM document_versions WHERE id = $1", [
            documentVersion,
          ]),
        ).rejects.toThrow("document version is immutable");
        await expect(
          client.query("DELETE FROM render_records WHERE id = $1", [
            renderRecord,
          ]),
        ).rejects.toThrow("render record evidence is immutable");
        await expect(
          client.query("DELETE FROM audit_events WHERE id = $1", [auditEvent]),
        ).rejects.toThrow("audit events are append-only");

        await client.query("BEGIN");
        await client.query("SET LOCAL hypergendoc.allow_purge = 'on'");
        await client.query("DELETE FROM workspaces WHERE id = $1", [workspace]);
        await client.query("COMMIT");
        purged = true;

        const deleted = await client.query(
          "SELECT (SELECT count(*) FROM style_versions WHERE id = $1) AS style_versions, (SELECT count(*) FROM document_versions WHERE id = $2) AS document_versions, (SELECT count(*) FROM render_records WHERE id = $3) AS render_records, (SELECT count(*) FROM audit_events WHERE id = $4) AS audit_events",
          [styleVersion, documentVersion, renderRecord, auditEvent],
        );
        expect(deleted.rows[0]).toEqual({
          style_versions: "0",
          document_versions: "0",
          render_records: "0",
          audit_events: "0",
        });
        const setting = await client.query<{ enabled: boolean }>(
          "SELECT current_setting('hypergendoc.allow_purge', true) = 'on' AS enabled",
        );
        expect(setting.rows[0]?.enabled).toBe(false);
      } finally {
        if (!purged) {
          try {
            await client.query("BEGIN");
            await client.query("SET LOCAL hypergendoc.allow_purge = 'on'");
            await client.query("DELETE FROM workspaces WHERE id = $1", [
              workspace,
            ]);
            await client.query("COMMIT");
          } catch {
            await client.query("ROLLBACK");
          }
        }
        await client.query('DELETE FROM "user" WHERE id = $1', [user]);
        client.release();
      }
    });
  },
);
