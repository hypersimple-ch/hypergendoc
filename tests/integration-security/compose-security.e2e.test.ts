import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const enabled = process.env.RUN_INTEGRATION_SECURITY === "1";
const envFile = process.env.PRODUCTION_ENV_FILE ?? "deploy/prod/secrets.env";
const project = process.env.PRODUCTION_COMPOSE_PROJECT;
const override = process.env.PRODUCTION_COMPOSE_OVERRIDE;

/**
 * Opt-in, non-destructive Compose acceptance test. The existing flow creates
 * uniquely named fixtures and verifies tenant-IDOR denial, member restrictions,
 * private signed-download authorization, bounded uploads/MCP bodies, scoped and
 * immediately revoked credentials, audit attribution, concurrent versions, and
 * MCP rate limiting against real PostgreSQL, MinIO, and the renderer.
 */
describe.skipIf(!enabled)("real deployment security acceptance", () => {
  it("rejects cross-tenant and bounded-input attacks without exposing private artifacts", async () => {
    expect(process.env.E2E_DATABASE_URL).toBeTruthy();
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
      cwd: process.cwd(),
      env: process.env,
      timeout: 60_000,
    });
    await execFileAsync(
      "docker",
      [...compose, "up", "-d", "--wait", "server"],
      { cwd: process.cwd(), env: process.env, timeout: 60_000 },
    );
    const { stdout, stderr } = await execFileAsync("pnpm", ["e2e:flow"], {
      cwd: process.cwd(),
      env: process.env,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    expect(stderr).not.toMatch(
      /hgd_[A-Za-z0-9_-]+|@example\.test|Serialized revision|Explicitly restyled/,
    );
    expect(JSON.parse(stdout)).toMatchObject({ status: "ok" });
    const logs = await execFileAsync(
      "docker",
      [
        "compose",
        ...(project ? ["-p", project] : []),
        "--env-file",
        envFile,
        "-f",
        "compose.prod.yaml",
        ...(override ? ["-f", override] : []),
        "logs",
        "--no-color",
        "server",
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    expect(logs.stdout).not.toMatch(
      /hgd_[A-Za-z0-9_-]+|better-auth\.session|X-Amz-Signature|@example\.test|Serialized revision|Explicitly restyled/,
    );
  }, 220_000);

  // The E2E flow also proves generic bounded authentication responses, session
  // rotation, authenticated artifact proxying/revocation, and polyglot rejection.
});
