import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const enabled = process.env.RUN_PRODUCTION_COMPOSE_TESTS === "1";
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
const compose = (args: string[], timeout = 45_000) =>
  execFileAsync("docker", ["compose", ...composeFiles, ...args], {
    cwd: process.cwd(),
    env: process.env,
    timeout,
    maxBuffer: 1024 * 1024,
  });

/** Requires an already-running production Compose stack; never tears it down or deletes volumes. */
describe.skipIf(!enabled)("production-Compose renderer containment", () => {
  let temporaryDirectory = "";
  let bundledClient = "";

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), "hypergendoc-render-test-"),
    );
    bundledClient = join(temporaryDirectory, "renderer-test.cjs");
    await execFileAsync(
      "pnpm",
      [
        "exec",
        "esbuild",
        "scripts/test-renderer-topology.ts",
        "--bundle",
        "--platform=node",
        "--format=cjs",
        `--outfile=${bundledClient}`,
      ],
      { cwd: process.cwd(), env: process.env, timeout: 30_000 },
    );
  });

  afterAll(async () => {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true });
  });

  it("has no network, no host bind mounts, a restricted socket, and explicit resource ceilings", async () => {
    const { stdout } = await compose(["config", "--format", "json"]);
    const config = JSON.parse(stdout) as {
      services: Record<
        string,
        {
          network_mode?: string;
          read_only?: boolean;
          cap_drop?: string[];
          security_opt?: string[];
          pids_limit?: number;
          mem_limit?: string | number;
          cpus?: number;
          volumes?: unknown[];
        }
      >;
    };
    const renderer = config.services.renderer;
    expect(renderer).toBeDefined();
    if (!renderer) throw new Error("renderer service is missing");
    expect(renderer.network_mode).toBe("none");
    expect(renderer.read_only).toBe(true);
    expect(renderer.cap_drop).toContain("ALL");
    expect(renderer.security_opt).toContain("no-new-privileges:true");
    expect(renderer.pids_limit).toBeLessThanOrEqual(64);
    expect(Number(renderer.mem_limit)).toBe(512 * 1024 * 1024);
    expect(renderer.cpus).toBe(1);
    expect(renderer.volumes ?? []).toHaveLength(1);
    const permissions = await compose([
      "exec",
      "-T",
      "renderer",
      "sh",
      "-ec",
      "stat -c '%a %F' /run/hypergendoc/renderer.sock",
    ]);
    expect(permissions.stdout.trim()).toBe("660 socket");
  });

  it("rejects network/file/shell/depth attacks, bounds malformed/output work, and survives a daemon restart", async () => {
    const network = await compose([
      "exec",
      "-T",
      "renderer",
      "node",
      "-e",
      "fetch('http://example.invalid').then(()=>process.exit(1)).catch(()=>process.exit(0))",
    ]);
    expect(network.stderr).toBe("");
    await expect(
      compose([
        "exec",
        "-T",
        "renderer",
        "sh",
        "-ec",
        "test ! -e /var/run/docker.sock && test ! -e /host && test ! -e /workspace/.git",
      ]),
    ).resolves.toBeDefined();

    const runCorpus = async () => {
      const result = await compose(
        [
          "run",
          "-T",
          "--rm",
          "--no-deps",
          "-v",
          `${resolve(bundledClient)}:/tmp/renderer-test.cjs:ro`,
          "--entrypoint",
          "node",
          "server",
          "/tmp/renderer-test.cjs",
        ],
        300_000,
      );
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: "ok",
        validRenders: 7,
        hostileInputsRejected: 11,
        resourceLimitInputsRejected: 1,
      });
    };

    await runCorpus();
    await compose(["restart", "renderer"], 60_000);
    await compose(["up", "-d", "--wait", "renderer"], 60_000);
    await runCorpus();
    const leftovers = await compose([
      "exec",
      "-T",
      "renderer",
      "sh",
      "-ec",
      "test -z \"$(find /tmp -maxdepth 1 -name 'hypergendoc-render-*' -print -quit)\"",
    ]);
    expect(leftovers.stderr).toBe("");
  }, 700_000);

  it("keeps the renderer inside configured cgroup ceilings", async () => {
    const container = (await compose(["ps", "-q", "renderer"])).stdout.trim();
    expect(container).not.toBe("");
    const { stdout } = await execFileAsync(
      "docker",
      [
        "inspect",
        "--format",
        "{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}}",
        container,
      ],
      { env: process.env, timeout: 30_000 },
    );
    const [memory, nanoCpus, pids] = stdout.trim().split(" ").map(Number);
    expect(memory).toBe(512 * 1024 * 1024);
    expect(nanoCpus).toBe(1_000_000_000);
    expect(pids).toBeLessThanOrEqual(64);
  });
});
