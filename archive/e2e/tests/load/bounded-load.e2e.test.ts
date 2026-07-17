import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const enabled = process.env.RUN_BOUNDED_LOAD === "1";
const envFile = process.env.PRODUCTION_ENV_FILE ?? "deploy/prod/secrets.env";
const project = process.env.PRODUCTION_COMPOSE_PROJECT;
const override = process.env.PRODUCTION_COMPOSE_OVERRIDE;
const composeFiles = [
  ...(project ? ["-p", project] : []),
  "--env-file",
  envFile,
  "-f",
  "compose.prod.yaml",
  ...(override ? ["-f", override] : []),
];
const compose = (args: string[], timeout = 60_000) =>
  execFileAsync("docker", ["compose", ...composeFiles, ...args], {
    cwd: process.cwd(),
    env: process.env,
    timeout,
    maxBuffer: 1024 * 1024,
  });

async function waitForReady(expected: 200 | 503): Promise<void> {
  const origin = process.env.E2E_ORIGIN;
  if (!origin) throw new Error("E2E_ORIGIN is required");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(new URL("/health/ready", origin));
      if (response.status === expected) return;
    } catch {
      // A brief connection failure is expected while services restart.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`readiness did not reach HTTP ${expected}`);
}

/**
 * MVP thresholds: 4 simultaneous version requests must allocate exactly the
 * next four unique integers; renderer work is serial on its one-CPU container;
 * each credential permits 60 MCP requests per limiter window; requests larger
 * than 256 KiB fail with 413. Traffic is deliberately bounded.
 */
describe.skipIf(!enabled)("bounded real-stack concurrency", () => {
  it("preserves version serialization and MCP admission thresholds under a bounded burst", async () => {
    expect(process.env.E2E_DATABASE_URL).toBeTruthy();
    await compose(["restart", "server"]);
    await compose(["up", "-d", "--wait", "server"]);
    const started = performance.now();
    const { stdout, stderr } = await execFileAsync("pnpm", ["e2e:flow"], {
      cwd: process.cwd(),
      env: { ...process.env, E2E_RESTART_SERVER: "1" },
      timeout: 180_000,
      maxBuffer: 1024 * 1024,
    });
    expect(stderr).not.toMatch(
      /hgd_[A-Za-z0-9_-]+|@example\.test|Serialized revision|Explicitly restyled/,
    );
    expect(JSON.parse(stdout)).toMatchObject({ status: "ok" });
    // Not a latency SLO: catches a wedged queue while allowing constrained CI.
    expect(performance.now() - started).toBeLessThan(180_000);
  }, 190_000);

  it("degrades and recovers across database, object-store, and server restarts", async () => {
    for (const service of ["postgres", "object-store"]) {
      await compose(["stop", service]);
      try {
        await waitForReady(503);
      } finally {
        await compose(["start", service]);
      }
      await waitForReady(200);
    }
    await compose(["restart", "server"]);
    await compose(["up", "-d", "--wait", "server"]);
    await waitForReady(200);
  }, 180_000);
});
