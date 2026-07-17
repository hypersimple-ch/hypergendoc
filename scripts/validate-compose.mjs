import { spawnSync } from "node:child_process";

const result = spawnSync(
  "docker",
  ["compose", "--env-file", ".env.example", "config", "--format", "json"],
  { encoding: "utf8" },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const config = JSON.parse(result.stdout);
const services = config.services ?? {};
const failures = [];

for (const [name, service] of Object.entries(services)) {
  if (
    name !== "proxy" &&
    Array.isArray(service.ports) &&
    service.ports.length > 0
  ) {
    failures.push(`${name} must not publish host ports`);
  }
}

const renderer = services.renderer;
if (!renderer || renderer.network_mode !== "none") {
  failures.push("renderer must use network_mode: none");
}
if (renderer?.privileged === true) {
  failures.push("renderer must not be privileged");
}
if (
  renderer?.volumes?.some((volume) =>
    String(volume.source ?? "").includes("docker.sock"),
  )
) {
  failures.push("renderer must not mount a container-engine socket");
}
if (renderer?.build?.dockerfile !== "apps/renderer/Dockerfile") {
  failures.push("renderer must use its Tectonic-enabled Dockerfile");
}
if (
  renderer?.depends_on?.["renderer-socket-init"]?.condition !==
  "service_completed_successfully"
) {
  failures.push("renderer must wait for socket initialization");
}

const socketInit = services["renderer-socket-init"];
if (
  !socketInit ||
  socketInit.network_mode !== "none" ||
  socketInit.read_only !== true ||
  socketInit.user !== "0:0" ||
  !socketInit.cap_add?.includes("CHOWN") ||
  !socketInit.volumes?.some((volume) => volume.target === "/run/hypergendoc")
) {
  failures.push("renderer socket initialization must remain constrained");
}
if (
  services.server?.depends_on?.["renderer-socket-init"]?.condition !==
    "service_completed_successfully" ||
  services.server?.depends_on?.renderer?.condition !== "service_healthy"
) {
  failures.push("server must wait for the initialized healthy renderer");
}

const proxyPorts = services.proxy?.ports ?? [];
if (proxyPorts.length !== 1 || Number(proxyPorts[0]?.target) !== 8080) {
  failures.push("development proxy must be the only published HTTP entrypoint");
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`compose policy: ${failure}`);
  process.exit(1);
}

console.log("Compose topology satisfies baseline isolation policy.");
