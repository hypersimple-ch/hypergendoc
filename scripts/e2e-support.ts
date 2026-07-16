import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { createDatabase } from "../packages/db/src/client.js";

const execFileAsync = promisify(execFile);
export const origin = process.env.E2E_ORIGIN ?? "http://localhost:8080";
const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required");

export const run = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
const password = randomBytes(24).toString("base64url");
export const { pool } = createDatabase({ connectionString: databaseUrl });

export type Json = Record<string, unknown>;
export type Session = { cookie: string };

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    session?: Session;
    redirect?: RequestRedirect;
  } = {},
): Promise<Response> {
  return fetch(new URL(path, origin), {
    method: options.method ?? "GET",
    redirect: options.redirect,
    headers: {
      Accept: "application/json",
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.method && options.method !== "GET" ? { Origin: origin } : {}),
      ...(options.session ? { Cookie: options.session.cookie } : {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

async function json(response: Response, expected: number): Promise<Json> {
  const text = await response.text();
  if (response.status !== expected)
    throw new Error(
      `Expected HTTP ${expected} from ${response.url}, got ${response.status}: ${text.slice(0, 500)}`,
    );
  return text ? (JSON.parse(text) as Json) : {};
}

export async function createVerifiedUser(
  kind: "owner" | "member",
  label: string,
): Promise<string> {
  const email = `${kind}-${label.toLowerCase()}-${run}@example.test`;
  await json(
    await request("/api/auth/sign-up/email", {
      method: "POST",
      body: {
        name: `${kind === "owner" ? "Owner" : "Member"} ${label}`,
        email,
        password,
      },
    }),
    200,
  );
  const verified = await pool.query(
    'UPDATE "user" SET email_verified = true WHERE email = $1',
    [email],
  );
  assert(verified.rowCount === 1, "Fixture user could not be verified");
  return email;
}

export async function signInVerifiedUser(
  email: string,
  existingCookie?: string,
): Promise<Session> {
  const response = await request("/api/auth/sign-in/email", {
    method: "POST",
    body: { email, password },
    ...(existingCookie ? { session: { cookie: existingCookie } } : {}),
  });
  await json(response, 200);
  const setCookie = response.headers.get("set-cookie");
  assert(setCookie, "Login did not return a session cookie");
  return { cookie: setCookie.split(";", 1)[0]! };
}

export async function createOwner(label: string): Promise<Session> {
  const email = await createVerifiedUser("owner", label);
  const fixedCookie = "better-auth.session_token=attacker-controlled";
  const session = await signInVerifiedUser(email, fixedCookie);
  assert(
    session.cookie !== fixedCookie &&
      !session.cookie.includes("attacker-controlled"),
    "Sign-in accepted a fixed session identifier",
  );
  return session;
}

export async function restartServerForPersistenceCheck(): Promise<void> {
  if (process.env.E2E_RESTART_SERVER !== "1") return;
  const envFile = process.env.PRODUCTION_ENV_FILE ?? "deploy/prod/secrets.env";
  const project = process.env.PRODUCTION_COMPOSE_PROJECT;
  const override = process.env.PRODUCTION_COMPOSE_OVERRIDE;
  const compose = [
    "compose",
    ...(project ? ["-p", project] : []),
    "--env-file",
    envFile,
    "-f",
    "compose.prod.yaml",
    ...(override ? ["-f", override] : []),
  ];
  await execFileAsync("docker", [...compose, "restart", "server"], {
    env: process.env,
    timeout: 60_000,
  });
  await execFileAsync("docker", [...compose, "up", "-d", "--wait", "server"], {
    env: process.env,
    timeout: 60_000,
  });
}

export async function verifyAuthBoundaries(email: string): Promise<void> {
  const passwordRow = await pool.query<{ password: string | null }>(
    'SELECT a.password FROM account a JOIN "user" u ON u.id = a.user_id WHERE u.email = $1',
    [email],
  );
  assert(
    passwordRow.rows[0]?.password?.startsWith("$argon2id$") === true,
    "Password was not stored with Argon2id",
  );

  const unknownLogin = await request("/api/auth/sign-in/email", {
    method: "POST",
    body: {
      email: `missing-${run}@example.test`,
      password: "incorrect-password-value",
    },
  });
  const knownLogin = await request("/api/auth/sign-in/email", {
    method: "POST",
    body: { email, password: "incorrect-password-value" },
  });
  const unknownLoginBody = await unknownLogin.text();
  const knownLoginBody = await knownLogin.text();
  assert(
    unknownLogin.status === 401 &&
      knownLogin.status === 401 &&
      unknownLoginBody === knownLoginBody,
    "Authentication response disclosed account existence",
  );
  assert(
    !unknownLoginBody.includes(email),
    "Authentication error reflected an email address",
  );

  const crossOriginLogin = await fetch(
    new URL("/api/auth/sign-in/email", origin),
    {
      method: "POST",
      headers: {
        Origin: "https://attacker.example.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  assert(crossOriginLogin.status === 403, "Cross-origin sign-in was accepted");

  let limited = false;
  for (let index = 0; index < 12; index += 1) {
    const attempt = await request("/api/auth/sign-in/email", {
      method: "POST",
      body: {
        email: `limited-${run}@example.test`,
        password: "incorrect-password-value",
      },
    });
    if (attempt.status === 429) {
      limited = true;
      break;
    }
  }
  assert(limited, "Authentication rate limit was not enforced");
}

export async function api(
  session: Session,
  path: string,
  method = "GET",
  body?: unknown,
  expected = 200,
): Promise<Json> {
  return json(await request(path, { method, body, session }), expected);
}

function parseSse(text: string): Json {
  const line = text
    .split("\n")
    .find((candidate) => candidate.startsWith("data: "));
  assert(line, "MCP response did not contain an SSE data event");
  return JSON.parse(line.slice(6)) as Json;
}

export async function mcp(
  token: string,
  id: number,
  method: string,
  params: Json,
  expectedStatus = 200,
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
  const text = await response.text();
  if (response.status !== expectedStatus)
    throw new Error(
      `Expected MCP HTTP ${expectedStatus}, got ${response.status}: ${text.slice(0, 500)}`,
    );
  return expectedStatus === 200 ? parseSse(text) : JSON.parse(text);
}

function toolContent(response: Json): Json {
  const result = response.result as Json | undefined;
  assert(
    result && result.isError !== true,
    `MCP tool returned an error: ${JSON.stringify(result)}`,
  );
  const structured = result.structuredContent;
  assert(
    structured && typeof structured === "object",
    "Missing structured content",
  );
  return structured as Json;
}

export async function tool(
  token: string,
  id: number,
  name: string,
  args: Json,
): Promise<Json> {
  try {
    return toolContent(
      await mcp(token, id, "tools/call", { name, arguments: args }),
    );
  } catch (error) {
    throw new Error(
      `${name} failed: ${error instanceof Error ? error.message : "unknown error"}`,
      { cause: error },
    );
  }
}

export const styleDefinition = {
  logoObjectId: null,
  bodyFont: "Inter",
  headingFont: "Noto Serif",
  bodySizePt: 10,
  headingScale: 1.4,
  italicStyle: "italic",
  colors: {
    text: "#17201c",
    heading: "#17201c",
    primary: "#a33b20",
    accent: "#276f62",
    muted: "#767b76",
  },
  page: {
    size: "A4",
    marginTopMm: 20,
    marginRightMm: 18,
    marginBottomMm: 20,
    marginLeftMm: 18,
  },
  header: {
    enabled: false,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: false,
  },
  footer: {
    enabled: true,
    leftText: "HyperGenDoc E2E",
    centerText: "",
    rightText: "",
    showPageNumber: true,
  },
};
