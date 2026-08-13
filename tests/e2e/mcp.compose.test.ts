import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import { sanitizeDocumentInput } from "../../packages/document/src/index.js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  alpineBoardDocument,
  alpineBoardStyle,
  alpineSystemsDocument,
  alpineSystemsStyle,
  assertMcpVisualFixtures,
} from "./fixtures/mcp-visual.js";

const enabled = process.env.RUN_E2E_MCP_COMPOSE === "1";
const origin = process.env.E2E_ORIGIN ?? "http://localhost:8080";
const run = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
const email = `mcp-compose-${run}@example.test`;
const password = randomBytes(24).toString("base64url");

type Json = Record<string, unknown>;
type Fixture = {
  session: string;
  workspaceId: string;
  companyId: string;
  otherCompanyId: string;
  alpineBoardStyleId: string;
  alpineBoardStyleVersionId: string;
  alpineSystemsStyleId: string;
  alpineSystemsStyleVersionId: string;
  templateId: string;
  templateVersionId: string;
  fullToken: string;
  idToolsToken: string;
  stylesOnlyToken: string;
};

let fixture: Fixture | undefined;

function record(value: unknown, label: string): Json {
  expect(typeof value, `${label} must be an object`).toBe("object");
  expect(value, `${label} must not be null`).not.toBeNull();
  return value as Json;
}

function string(value: unknown, label: string): string {
  expect(typeof value, `${label} must be a string`).toBe("string");
  return value as string;
}

function expectBody(value: unknown, expected: string, label: string): void {
  expect(string(value, `${label} body`), `${label} body did not match`).toBe(
    expected,
  );
}

function expectStyleVersion(
  snapshot: Json,
  styleVersionId: string,
  label: string,
): void {
  expect(string(snapshot.styleVersionId, `${label} style version`)).toBe(
    styleVersionId,
  );
}

async function http(
  path: string,
  options: { method?: string; body?: Json; session?: string } = {},
): Promise<Response> {
  const method = options.method ?? "GET";
  return fetch(new URL(path, origin), {
    method,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(method === "GET" ? {} : { Origin: origin }),
      ...(options.session ? { Cookie: options.session } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
}

async function json(
  response: Response,
  status: number,
  label: string,
): Promise<Json> {
  expect(response.status, `${label} returned an unexpected status`).toBe(
    status,
  );
  return record(await response.json(), label);
}

type PdfArtifact = {
  filename: "alpine-board.pdf" | "alpine-systems.pdf";
  documentId: string;
  styleId: string;
  styleVersionId: string;
  commitSha: string;
  pageIntent: string;
  bytes: Uint8Array;
};

async function pdf(
  documentId: string,
  session: string,
  commitSha: string,
): Promise<Uint8Array> {
  const response = await http(
    `/api/documents/${documentId}/pdf?disposition=inline`,
    { session },
  );
  expect(response.status, "PDF returned an unexpected status").toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-document-commit")).toBe(commitSha);
  expect(response.headers.get("content-disposition")).toBe(
    `inline; filename="document-${commitSha.slice(0, 12)}.pdf"`,
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  expect(
    bytes.byteLength,
    "PDF must contain more than its header",
  ).toBeGreaterThan(1_000);
  return bytes;
}

async function exportVisualArtifacts(artifacts: PdfArtifact[]): Promise<void> {
  const configured = process.env.MCP_VISUAL_ARTIFACT_DIR;
  if (!configured) return;
  const directory = resolve(configured);
  if (directory === parse(directory).root)
    throw new Error("MCP_VISUAL_ARTIFACT_DIR must not be the filesystem root");
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  await Promise.all([
    ...artifacts.map(({ filename, bytes }) =>
      writeFile(join(directory, filename), bytes),
    ),
    writeFile(
      join(directory, "manifest.json"),
      `${JSON.stringify(
        {
          documents: artifacts.map(
            ({
              filename,
              documentId,
              styleId,
              styleVersionId,
              commitSha,
              pageIntent,
            }) => ({
              filename,
              documentId,
              styleId,
              styleVersionId,
              commitSha,
              pageIntent,
            }),
          ),
        },
        null,
        2,
      )}\n`,
    ),
  ]);
}

async function compose(
  service: "postgres" | "server",
  command: string,
  input?: string,
  args: string[] = [],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        service,
        "sh",
        "-ec",
        command,
        "mcp-compose",
        ...args,
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk));
    child.on("error", () =>
      reject(new Error(`Unable to run Compose ${service} command`)),
    );
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            `Compose ${service} command failed with exit code ${code}: ${stderr.slice(0, 200)}`,
          ),
        );
    });
    child.stdin.end(input);
  });
}

function safeFixtureEmail(): string {
  expect(email).toMatch(/^mcp-compose-[a-z0-9-]+@example\.test$/);
  return email;
}

async function verifyEmail(): Promise<void> {
  const verified = await compose(
    "postgres",
    'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At',
    `UPDATE "user" SET email_verified = true WHERE email = '${safeFixtureEmail()}' RETURNING id;`,
  );
  expect(verified.trim(), "fixture user was not verified").not.toBe("");
}

async function cleanupFixture(): Promise<void> {
  const workspaceId = fixture?.workspaceId;
  if (workspaceId) {
    await compose(
      "server",
      'test -n "$DOCUMENT_GIT_ROOT"; rm -rf -- "$DOCUMENT_GIT_ROOT/workspaces/$1"',
      undefined,
      [workspaceId],
    ).catch(() => undefined);
  }
  const output = await compose(
    "postgres",
    'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At',
    `BEGIN;
SET LOCAL hypergendoc.allow_purge = 'on';
DELETE FROM documents WHERE workspace_id IN (SELECT m.workspace_id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = '${safeFixtureEmail()}');
DELETE FROM templates WHERE workspace_id IN (SELECT m.workspace_id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = '${safeFixtureEmail()}');
DELETE FROM company_fonts WHERE workspace_id IN (SELECT m.workspace_id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = '${safeFixtureEmail()}');
DELETE FROM company_colors WHERE workspace_id IN (SELECT m.workspace_id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = '${safeFixtureEmail()}');
DELETE FROM stored_objects WHERE workspace_id IN (SELECT m.workspace_id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = '${safeFixtureEmail()}');
DELETE FROM workspaces WHERE id IN (SELECT m.workspace_id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = '${safeFixtureEmail()}');
DELETE FROM "user" WHERE email = '${safeFixtureEmail()}';
SELECT count(*) FROM "user" WHERE email = '${safeFixtureEmail()}';
COMMIT;`,
  );
  expect(
    output.trim().split("\n").at(-1),
    "fixture user cleanup did not complete",
  ).toBe("0");
  if (workspaceId) {
    await compose(
      "server",
      'test -n "$DOCUMENT_GIT_ROOT"; test ! -e "$DOCUMENT_GIT_ROOT/workspaces/$1"',
      undefined,
      [workspaceId],
    );
  }
}

function parseSse(text: string): Json {
  const line = text.split(/\r?\n/).find((value) => value.startsWith("data: "));
  expect(line, "MCP response did not contain a data event").toBeDefined();
  return record(JSON.parse(line!.slice(6)), "MCP response");
}

async function mcp(
  token: string,
  id: number,
  method: string,
  params: Json,
): Promise<Json> {
  const response = await fetch(new URL("/mcp", origin), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  expect(response.status, `${method} returned an unexpected status`).toBe(200);
  return parseSse(await response.text());
}

async function tool(
  token: string,
  id: number,
  name: string,
  arguments_: Json,
): Promise<Json> {
  const response = await mcp(token, id, "tools/call", {
    name,
    arguments: arguments_,
  });
  const result = record(response.result, `${name} result`);
  expect(result.isError, `${name} returned a tool error`).not.toBe(true);
  return record(result.structuredContent, `${name} structured content`);
}

async function toolError(
  token: string,
  id: number,
  name: string,
  arguments_: Json,
  code: string,
): Promise<void> {
  const response = await mcp(token, id, "tools/call", {
    name,
    arguments: arguments_,
  });
  const result = record(response.result, `${name} result`);
  expect(result.isError, `${name} must fail`).toBe(true);
  const content = record(
    (result.content as unknown[])?.[0],
    `${name} error content`,
  );
  expect(
    string(content.text, `${name} error text`).startsWith(`${code}:`),
  ).toBe(true);
}

describe.skipIf(!enabled)("Compose MCP endpoint", () => {
  beforeAll(async () => {
    assertMcpVisualFixtures();
    const signup = await json(
      await http("/api/auth/sign-up/email", {
        method: "POST",
        body: { name: "MCP Compose Fixture", email, password },
      }),
      200,
      "sign-up",
    );
    expect(signup).toBeDefined();
    await verifyEmail();
    const signInResponse = await http("/api/auth/sign-in/email", {
      method: "POST",
      body: { email, password },
    });
    const signIn = await json(signInResponse, 200, "sign-in");
    expect(signIn).toBeDefined();
    const session = string(
      signInResponse.headers.get("set-cookie"),
      "sign-in session",
    ).split(";", 1)[0]!;
    const workspace = await json(
      await http("/api/workspaces", {
        method: "POST",
        session,
        body: { name: `MCP Compose ${run}` },
      }),
      201,
      "workspace creation",
    );
    const company = await json(
      await http("/api/companies", {
        method: "POST",
        session,
        body: { name: `MCP Company ${run}` },
      }),
      201,
      "company creation",
    );
    const otherCompany = await json(
      await http("/api/companies", {
        method: "POST",
        session,
        body: { name: `MCP Other Company ${run}` },
      }),
      201,
      "other company creation",
    );
    const companyId = string(company.id, "company id");
    const otherCompanyId = string(otherCompany.id, "other company id");
    const style = await json(
      await http(`/api/companies/${companyId}/styles`, {
        method: "POST",
        session,
        body: { name: "Alpine Board", definition: alpineBoardStyle },
      }),
      201,
      "first style creation",
    );
    const systemsStyle = await json(
      await http(`/api/companies/${companyId}/styles`, {
        method: "POST",
        session,
        body: { name: "Alpine Systems", definition: alpineSystemsStyle },
      }),
      201,
      "second style creation",
    );
    const board = record(style.style, "board style");
    const boardVersion = record(style.version, "board style version");
    const systems = record(systemsStyle.style, "systems style");
    const systemsVersion = record(
      systemsStyle.version,
      "systems style version",
    );
    const alpineBoardStyleId = string(board.id, "board style id");
    const alpineBoardStyleVersionId = string(
      boardVersion.id,
      "board style version id",
    );
    expect(board.activeVersionId).toBe(alpineBoardStyleVersionId);
    const alpineSystemsStyleId = string(systems.id, "systems style id");
    const alpineSystemsStyleVersionId = string(
      systemsVersion.id,
      "systems style version id",
    );
    expect(systems.activeVersionId).toBe(alpineSystemsStyleVersionId);
    const templateCreation = await json(
      await http(`/api/companies/${companyId}/templates`, {
        method: "POST",
        session,
        body: {
          name: "MCP Engagement Brief",
          definition: {
            schemaVersion: 1,
            styleVersionId: alpineBoardStyleVersionId,
            fields: {
              title: { type: "text", label: "Title", required: true },
              body: { type: "richText", label: "Body", required: true },
            },
            pageMasters: { standard: {} },
            document: [
              {
                type: "page",
                master: "standard",
                children: [
                  {
                    type: "heading",
                    level: 1,
                    content: [{ type: "binding", path: "title" }],
                  },
                  { type: "richText", source: "body" },
                ],
              },
            ],
          },
        },
      }),
      201,
      "template creation",
    );
    const template = record(templateCreation.template, "template");
    const templateVersion = record(
      templateCreation.version,
      "template version",
    );
    const templateId = string(template.id, "template id");
    const templateVersionId = string(templateVersion.id, "template version id");
    expect(template.activeVersionId).toBe(templateVersionId);
    const credential = async (
      name: string,
      companyIds: string[],
      actions: string[],
    ) =>
      json(
        await http("/api/mcp-credentials", {
          method: "POST",
          session,
          body: { name, companyIds, actions },
        }),
        201,
        `${name} credential`,
      );
    const full = await credential(
      "MCP full",
      [companyId, otherCompanyId],
      [
        "companies:read",
        "styles:read",
        "templates:read",
        "documents:read",
        "documents:write",
      ],
    );
    const idTools = await credential(
      "MCP ID tools",
      [companyId],
      ["styles:read", "templates:read", "documents:read", "documents:write"],
    );
    const stylesOnly = await credential(
      "MCP styles only",
      [companyId],
      ["styles:read"],
    );
    fixture = {
      session,
      workspaceId: string(workspace.id, "workspace id"),
      companyId,
      otherCompanyId,
      alpineBoardStyleId,
      alpineBoardStyleVersionId,
      alpineSystemsStyleId,
      alpineSystemsStyleVersionId,
      templateId,
      templateVersionId,
      fullToken: string(full.token, "full MCP token"),
      idToolsToken: string(idTools.token, "ID-tools MCP token"),
      stylesOnlyToken: string(stylesOnly.token, "styles-only MCP token"),
    };
  }, 120_000);

  afterAll(async () => {
    await cleanupFixture();
  }, 120_000);

  test("discovers exactly the thirteen public tools", async () => {
    const current = fixture!;
    await mcp(current.fullToken, 1, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "compose-e2e", version: "1" },
    });
    const response = await mcp(current.fullToken, 2, "tools/list", {});
    const tools = record(response.result, "tools/list result")
      .tools as unknown[];
    expect(tools).toHaveLength(13);
    expect(
      tools
        .map((entry) => string(record(entry, "tool").name, "tool name"))
        .sort(),
    ).toEqual([
      "create_document",
      "create_document_from_template",
      "get_document",
      "get_template",
      "list_companies",
      "list_document_commits",
      "list_documents",
      "list_styles",
      "list_templates",
      "read_document_commit",
      "revert_document",
      "update_document",
      "update_template_document",
    ]);
  });

  test("enforces scopes and permits ID tools without companies:read", async () => {
    const current = fixture!;
    const styles = await tool(current.idToolsToken, 10, "list_styles", {
      companyId: current.companyId,
      limit: 1,
    });
    expect(record(styles.items, "style items")).toBeDefined();
    await toolError(
      current.idToolsToken,
      11,
      "list_companies",
      { limit: 1 },
      "forbidden",
    );
    await toolError(
      current.idToolsToken,
      12,
      "list_styles",
      { companyId: current.otherCompanyId, limit: 1 },
      "not_found",
    );
    await toolError(
      current.stylesOnlyToken,
      13,
      "get_document",
      { documentId: "00000000-0000-4000-8000-000000000001" },
      "forbidden",
    );
  });

  test("creates, updates, reads history, reverts, and paginates documents", async () => {
    const current = fixture!;
    const originalBody = alpineBoardDocument.body;
    const updatedBody = `${originalBody}\n\n## Revision\n\nTemporary MCP revision.`;
    const created = await tool(current.idToolsToken, 20, "create_document", {
      companyId: current.companyId,
      styleId: current.alpineBoardStyleId,
      title: alpineBoardDocument.title,
      format: alpineBoardDocument.format,
      body: originalBody,
    });
    const document = record(created.document, "created document");
    const documentId = string(document.id, "document id");
    const initial = record(created.current, "initial current");
    const initialCommit = record(initial.commit, "initial commit");
    const initialSha = string(initialCommit.commitSha, "initial commit SHA");
    expect(initialCommit.parentCommitSha).toBeNull();
    const initialSnapshot = record(initial.snapshot, "initial snapshot");
    expectBody(initialSnapshot.body, originalBody, "initial snapshot");
    expectStyleVersion(
      initialSnapshot,
      current.alpineBoardStyleVersionId,
      "initial snapshot",
    );

    const updated = await tool(current.idToolsToken, 21, "update_document", {
      documentId,
      format: "markdown",
      body: updatedBody,
    });
    const updatedCommit = record(updated.commit, "updated commit");
    const updatedSha = string(updatedCommit.commitSha, "updated commit SHA");
    expect(updatedCommit.parentCommitSha).toBe(initialSha);
    const updatedSnapshot = record(updated.snapshot, "updated snapshot");
    expectBody(updatedSnapshot.body, updatedBody, "updated snapshot");
    expectStyleVersion(
      updatedSnapshot,
      current.alpineBoardStyleVersionId,
      "updated snapshot",
    );

    const historical = await tool(
      current.idToolsToken,
      22,
      "read_document_commit",
      { documentId, commitSha: initialSha },
    );
    const historicalSnapshot = record(
      historical.snapshot,
      "historical snapshot",
    );
    expectBody(historicalSnapshot.body, originalBody, "historical snapshot");
    expectStyleVersion(
      historicalSnapshot,
      current.alpineBoardStyleVersionId,
      "historical snapshot",
    );

    const reverted = await tool(current.idToolsToken, 23, "revert_document", {
      documentId,
      commitSha: initialSha,
    });
    const revertedCommit = record(reverted.commit, "reverted commit");
    const revertedSha = string(revertedCommit.commitSha, "reverted commit SHA");
    expect(revertedSha).not.toBe(initialSha);
    expect(revertedCommit.parentCommitSha).toBe(updatedSha);
    const revertedSnapshot = record(reverted.snapshot, "reverted snapshot");
    const revertedSnapshotSha = string(
      revertedSnapshot.commitSha,
      "reverted snapshot commit SHA",
    );
    expect(revertedSnapshotSha).toBe(revertedSha);
    expectBody(revertedSnapshot.body, originalBody, "reverted snapshot");
    expectStyleVersion(
      revertedSnapshot,
      current.alpineBoardStyleVersionId,
      "reverted snapshot",
    );

    const detail = await tool(current.idToolsToken, 24, "get_document", {
      documentId,
    });
    const currentSnapshot = record(
      record(detail.current, "document current").snapshot,
      "current snapshot",
    );
    expectBody(currentSnapshot.body, originalBody, "current snapshot");
    expectStyleVersion(
      currentSnapshot,
      current.alpineBoardStyleVersionId,
      "current snapshot",
    );

    const another = await tool(current.idToolsToken, 25, "create_document", {
      companyId: current.companyId,
      styleId: current.alpineSystemsStyleId,
      title: alpineSystemsDocument.title,
      format: alpineSystemsDocument.format,
      body: alpineSystemsDocument.body,
    });
    const anotherDocument = record(another.document, "second document");
    const anotherDocumentId = string(anotherDocument.id, "second document id");
    expect(anotherDocument.companyId).toBe(current.companyId);
    const anotherCurrent = record(another.current, "second document current");
    const anotherCommit = record(
      anotherCurrent.commit,
      "second document commit",
    );
    const anotherSha = string(
      anotherCommit.commitSha,
      "second document commit SHA",
    );
    const anotherSnapshot = record(
      anotherCurrent.snapshot,
      "second document snapshot",
    );
    const anotherSnapshotSha = string(
      anotherSnapshot.commitSha,
      "second document snapshot commit SHA",
    );
    expect(anotherSnapshotSha).toBe(anotherSha);
    expectBody(
      anotherSnapshot.body,
      sanitizeDocumentInput(
        alpineSystemsDocument.format,
        alpineSystemsDocument.body,
      ),
      "second document snapshot",
    );
    expectStyleVersion(
      anotherSnapshot,
      current.alpineSystemsStyleVersionId,
      "second document snapshot",
    );

    await exportVisualArtifacts([
      {
        filename: "alpine-board.pdf",
        documentId,
        styleId: current.alpineBoardStyleId,
        styleVersionId: current.alpineBoardStyleVersionId,
        commitSha: revertedSnapshotSha,
        pageIntent: "Alpine Board leadership brief",
        bytes: await pdf(documentId, current.session, revertedSnapshotSha),
      },
      {
        filename: "alpine-systems.pdf",
        documentId: anotherDocumentId,
        styleId: current.alpineSystemsStyleId,
        styleVersionId: current.alpineSystemsStyleVersionId,
        commitSha: anotherSnapshotSha,
        pageIntent: "Alpine Systems operational brief",
        bytes: await pdf(
          anotherDocumentId,
          current.session,
          anotherSnapshotSha,
        ),
      },
    ]);
    const documentsFirst = await tool(
      current.idToolsToken,
      26,
      "list_documents",
      { companyId: current.companyId, limit: 1 },
    );
    const documentsFirstItems = documentsFirst.items as unknown[];
    expect(documentsFirstItems).toHaveLength(1);
    const documentsCursor = string(
      documentsFirst.nextCursor,
      "documents cursor",
    );
    const documentsSecond = await tool(
      current.idToolsToken,
      27,
      "list_documents",
      { companyId: current.companyId, limit: 1, cursor: documentsCursor },
    );
    expect(documentsSecond.items as unknown[]).toHaveLength(1);

    const stylesFirst = await tool(current.idToolsToken, 28, "list_styles", {
      companyId: current.companyId,
      limit: 1,
    });
    const stylesCursor = string(stylesFirst.nextCursor, "styles cursor");
    const stylesSecond = await tool(current.idToolsToken, 29, "list_styles", {
      companyId: current.companyId,
      limit: 1,
      cursor: stylesCursor,
    });
    expect(stylesSecond.items as unknown[]).toHaveLength(1);

    const commitsFirst = await tool(
      current.idToolsToken,
      30,
      "list_document_commits",
      { documentId, limit: 1 },
    );
    const commitsCursor = string(commitsFirst.nextCursor, "commits cursor");
    const commitsSecond = await tool(
      current.idToolsToken,
      31,
      "list_document_commits",
      { documentId, limit: 1, cursor: commitsCursor },
    );
    expect(commitsSecond.items as unknown[]).toHaveLength(1);

    const companiesFirst = await tool(current.fullToken, 32, "list_companies", {
      limit: 1,
    });
    const companiesCursor = string(
      companiesFirst.nextCursor,
      "companies cursor",
    );
    const companiesSecond = await tool(
      current.fullToken,
      33,
      "list_companies",
      { limit: 1, cursor: companiesCursor },
    );
    expect(companiesSecond.items as unknown[]).toHaveLength(1);
  }, 120_000);

  test("discovers templates and writes pinned template documents", async () => {
    const current = fixture!;
    const listed = await tool(current.idToolsToken, 14, "list_templates", {
      companyId: current.companyId,
      limit: 10,
    });
    const listedItems = listed.items as unknown[];
    expect(listedItems).toHaveLength(1);
    expect(record(listedItems[0], "listed template").id).toBe(
      current.templateId,
    );

    const discovered = await tool(current.idToolsToken, 15, "get_template", {
      templateId: current.templateId,
    });
    expect(record(discovered.template, "discovered template").id).toBe(
      current.templateId,
    );
    expect(record(discovered.version, "discovered version").id).toBe(
      current.templateVersionId,
    );

    const created = await tool(
      current.idToolsToken,
      16,
      "create_document_from_template",
      {
        companyId: current.companyId,
        templateId: current.templateId,
        title: "MCP template document",
        data: {
          title: "Pinned template title",
          body: "<p>Created through the template tool.</p>",
        },
      },
    );
    const document = record(created.document, "template document");
    const documentId = string(document.id, "template document id");
    expect(document.templateId).toBe(current.templateId);
    const initial = record(created.current, "template document current");
    const initialCommit = record(initial.commit, "template initial commit");
    const initialSnapshot = record(
      initial.snapshot,
      "template initial snapshot",
    );
    expect(initialSnapshot.format).toBe("template");
    expect(initialSnapshot.templateVersionId).toBe(current.templateVersionId);
    const initialBody = record(
      JSON.parse(string(initialSnapshot.body, "template initial body")),
      "template initial body JSON",
    );
    expect(record(initialBody.data, "template initial data").title).toBe(
      "Pinned template title",
    );

    const updated = await tool(
      current.idToolsToken,
      17,
      "update_template_document",
      {
        documentId,
        data: {
          title: "Pinned template title revised",
          body: "<p>Updated through the template tool.</p>",
        },
      },
    );
    const updatedCommit = record(updated.commit, "template updated commit");
    expect(updatedCommit.parentCommitSha).toBe(initialCommit.commitSha);
    const updatedSnapshot = record(
      updated.snapshot,
      "template updated snapshot",
    );
    expect(updatedSnapshot.templateVersionId).toBe(current.templateVersionId);
    const updatedBody = record(
      JSON.parse(string(updatedSnapshot.body, "template updated body")),
      "template updated body JSON",
    );
    expect(record(updatedBody.data, "template updated data").title).toBe(
      "Pinned template title revised",
    );

    await toolError(
      current.stylesOnlyToken,
      18,
      "list_templates",
      { companyId: current.companyId, limit: 1 },
      "forbidden",
    );
  }, 120_000);
});
