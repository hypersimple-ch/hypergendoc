import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(0, "utf8"));
const services = config.services ?? {};
const failures = [];

if (services.proxy)
  failures.push("production must use Dokploy Traefik, not an in-stack proxy");
for (const [name, service] of Object.entries(services)) {
  if ((service.ports?.length ?? 0) !== 0)
    failures.push(`${name} publishes a host port`);
  if (
    String(service.image ?? "")
      .toLowerCase()
      .includes("caddy")
  )
    failures.push(`${name} uses the removed production Caddy image`);
  if (
    ["web", "server", "renderer", "db-migrate", "object-store"].includes(
      name,
    ) &&
    service.read_only !== true
  )
    failures.push(`${name} must have a read-only filesystem`);
  if (
    ["web", "server", "renderer", "db-migrate", "object-store"].includes(
      name,
    ) &&
    !(service.cap_drop ?? []).includes("ALL")
  )
    failures.push(`${name} must drop all capabilities`);
}

if (!services.web?.expose?.some((port) => Number(port) === 3000))
  failures.push("web must expose container port 3000 to Dokploy Traefik");
if (!services.server?.expose?.some((port) => Number(port) === 4000))
  failures.push("server must expose container port 4000 to Dokploy Traefik");

const secretName = /(PASSWORD|SECRET|PEPPER|DATABASE_URL|S3_ACCESS|SMTP_URL)/;
for (const name of ["web", "renderer", "renderer-socket-init"]) {
  const exposed = Object.keys(services[name]?.environment ?? {}).filter((key) =>
    secretName.test(key),
  );
  if (exposed.length)
    failures.push(`${name} receives unrelated secrets: ${exposed.join(", ")}`);
}
if (
  Object.keys(services["db-migrate"]?.environment ?? {}).some(
    (key) => key !== "DATABASE_URL",
  )
)
  failures.push("migration container must receive only DATABASE_URL");
if (services.renderer?.network_mode !== "none")
  failures.push("renderer must not have a network");
if (
  services.renderer?.volumes?.some((v) =>
    String(v.source ?? "").includes("docker.sock"),
  )
)
  failures.push("renderer mounts a container socket");

const objectStore = services["object-store"];
if (
  objectStore?.user !== "10001:10001" ||
  !String(objectStore?.image ?? "").startsWith("hypergendoc-object-store:") ||
  !("object-data-init" in (objectStore?.depends_on ?? {}))
)
  failures.push(
    "object store must use the non-root, source-built image after data initialization",
  );

const objectDataInit = services["object-data-init"];
if (
  objectDataInit?.network_mode !== "none" ||
  objectDataInit?.read_only !== true ||
  !(objectDataInit?.cap_drop ?? []).includes("ALL") ||
  JSON.stringify(objectDataInit?.cap_add ?? []) !== JSON.stringify(["CHOWN"]) ||
  objectDataInit?.restart !== "no"
)
  failures.push("object data initialization is not narrowly constrained");

const socketInit = services["renderer-socket-init"];
if (
  socketInit?.network_mode !== "none" ||
  socketInit?.read_only !== true ||
  !(socketInit?.cap_drop ?? []).includes("ALL") ||
  JSON.stringify(socketInit?.cap_add ?? []) !== JSON.stringify(["CHOWN"]) ||
  socketInit?.restart !== "no"
)
  failures.push("renderer socket initialization is not narrowly constrained");
for (const name of ["server", "renderer"]) {
  if (!("renderer-socket-init" in (services[name]?.depends_on ?? {})))
    failures.push(`${name} must wait for renderer socket initialization`);
}
if (config.networks?.data?.internal !== true)
  failures.push("data network must be internal");

const dockerfiles = [
  "deploy/prod/Dockerfile.server",
  "deploy/prod/Dockerfile.web",
  "deploy/prod/Dockerfile.object-store",
  "apps/renderer/Dockerfile",
];
for (const file of dockerfiles) {
  const source = readFileSync(file, "utf8");
  if (/COPY\s+[^\n]*(?:\.env|secret)/i.test(source))
    failures.push(`${file} appears to bake an environment or secret file`);
}
if (services["db-migrate"]?.restart !== "no")
  failures.push("migrations must be one-shot");
if (services["db-migrate"]?.image === services.server?.image)
  failures.push("migration and server targets must use distinct image tags");
if (
  !readFileSync("deploy/prod/Dockerfile.server", "utf8").includes(
    "COPY --from=build /out/migrate.js ./migrate.js",
  )
)
  failures.push("migration image must contain the migration entrypoint");

if (failures.length) {
  for (const failure of failures)
    console.error(`production compose policy: ${failure}`);
  process.exit(1);
}
console.log(
  "Dokploy production Compose topology and secret-build policy satisfy assertions.",
);
