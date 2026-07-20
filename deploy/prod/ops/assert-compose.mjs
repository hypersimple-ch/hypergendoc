import { existsSync, readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(0, "utf8"));
const productionCompose = readFileSync("compose.prod.yaml", "utf8");
const services = config.services ?? {};
const gitRoot = "/var/lib/hypergendoc/git";
const failures = [];
const garageImage =
  "docker.io/dxflrs/garage:v2.3.0@sha256:866bd13ed2038ba7e7190e840482bc27234c4afaf77be8cfa439ae088c1e4690";
const awsCliImage =
  "amazon/aws-cli:2.35.24@sha256:f7e6c7fb03510fd1f4e27469458ca372a37c823a8c32860e0dd2f04a41787794";

function hasVolume(service, target, source, readOnly = false) {
  return service?.volumes?.some(
    (volume) =>
      volume.target === target &&
      (source === undefined || volume.source === source) &&
      (!readOnly || volume.read_only === true),
  );
}

function hasOnlyNetwork(service, network) {
  return (
    JSON.stringify(Object.keys(service?.networks ?? {}).sort()) ===
    JSON.stringify([network])
  );
}

function hasNoNewPrivileges(service) {
  return (service?.security_opt ?? []).includes("no-new-privileges:true");
}

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

const server = services.server;
if (
  server?.read_only !== true ||
  server?.user !== "10001:10001" ||
  server?.environment?.DOCUMENT_GIT_ROOT !== gitRoot ||
  !hasVolume(server, gitRoot, "git-data")
) {
  failures.push(
    "server must run as 10001 with a read-only root and matching durable Git root volume",
  );
}
if (!("git-data" in (config.volumes ?? {})))
  failures.push("durable Git data volume must be declared");
const gitDataInit = services["git-data-init"];
if (
  gitDataInit?.network_mode !== "none" ||
  gitDataInit?.read_only !== true ||
  gitDataInit?.user !== "0:0" ||
  !(gitDataInit?.cap_drop ?? []).includes("ALL") ||
  JSON.stringify(gitDataInit?.cap_add ?? []) !== JSON.stringify(["CHOWN"]) ||
  gitDataInit?.restart !== "no" ||
  !hasVolume(gitDataInit, gitRoot, "git-data") ||
  !String(gitDataInit?.command ?? "").includes("chmod 0700") ||
  !String(gitDataInit?.command ?? "").includes("chown 10001:10001") ||
  server?.depends_on?.["git-data-init"]?.condition !==
    "service_completed_successfully"
) {
  failures.push(
    "Git data initialization must be isolated and establish 10001 ownership before server startup",
  );
}

const secretName = /(PASSWORD|SECRET|PEPPER|DATABASE_URL|S3_ACCESS)/;
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
  services.renderer?.volumes?.some((volume) =>
    String(volume.source ?? "").includes("docker.sock"),
  )
)
  failures.push("renderer mounts a container socket");

const objectStore = services["object-store"];
if (objectStore?.image !== garageImage || objectStore?.build !== undefined)
  failures.push(
    "object store must use the pinned Garage image without a build",
  );
if (
  JSON.stringify(objectStore?.command) !==
  JSON.stringify(["/garage", "server", "--single-node", "--default-bucket"])
)
  failures.push(
    "object store must use Garage single-node default-bucket bootstrap",
  );
if (
  objectStore?.user !== "10001:10001" ||
  objectStore?.read_only !== true ||
  !(objectStore?.cap_drop ?? []).includes("ALL") ||
  !hasNoNewPrivileges(objectStore)
)
  failures.push(
    "object store must run non-root with filesystem and capability hardening",
  );
if (
  !hasVolume(objectStore, "/etc/garage.toml", undefined, true) ||
  !hasVolume(objectStore, "/var/lib/garage/meta", "object-metadata") ||
  !hasVolume(objectStore, "/var/lib/garage/data", "object-data")
)
  failures.push(
    "object store must mount its read-only config and separate metadata/data volumes",
  );
if (!hasOnlyNetwork(objectStore, "data"))
  failures.push(
    "object store must be reachable only on the internal data network",
  );
if (
  JSON.stringify(objectStore?.healthcheck?.test) !==
  JSON.stringify(["CMD", "/garage", "status"])
)
  failures.push("object store must use Garage status health checks");
const objectStoreEnvironment = Object.keys(
  objectStore?.environment ?? {},
).sort();
if (
  JSON.stringify(objectStoreEnvironment) !==
  JSON.stringify(
    [
      "GARAGE_CONFIG_FILE",
      "GARAGE_DEFAULT_ACCESS_KEY",
      "GARAGE_DEFAULT_BUCKET",
      "GARAGE_DEFAULT_SECRET_KEY",
      "GARAGE_RPC_SECRET",
    ].sort(),
  )
)
  failures.push(
    "object store must receive only its Garage bootstrap and RPC settings",
  );

if ("object-store-init" in services)
  failures.push("legacy object-store initialization services must be absent");
if (existsSync("deploy/prod/Dockerfile.object-store"))
  failures.push("the removed object-store Dockerfile must not return");

const objectDataInit = services["object-data-init"];
if (
  objectDataInit?.network_mode !== "none" ||
  objectDataInit?.read_only !== true ||
  !(objectDataInit?.cap_drop ?? []).includes("ALL") ||
  JSON.stringify(objectDataInit?.cap_add ?? []) !== JSON.stringify(["CHOWN"]) ||
  objectDataInit?.restart !== "no" ||
  !hasVolume(objectDataInit, "/var/lib/garage/meta", "object-metadata") ||
  !hasVolume(objectDataInit, "/var/lib/garage/data", "object-data")
)
  failures.push("object data initialization is not narrowly constrained");
if (!("object-data-init" in (objectStore?.depends_on ?? {})))
  failures.push("object store must wait for object data initialization");

const objectStoreTools = services["object-store-tools"];
if (
  !productionCompose.includes(
    `object-store-tools:\n    image: ${awsCliImage}\n    profiles: [tools]`,
  )
)
  failures.push("object-store tools must be a pinned AWS CLI tools profile");
if (
  objectStoreTools &&
  (objectStoreTools.image !== awsCliImage ||
    !objectStoreTools.profiles?.includes("tools") ||
    objectStoreTools.read_only !== true ||
    !(objectStoreTools.cap_drop ?? []).includes("ALL") ||
    !hasNoNewPrivileges(objectStoreTools) ||
    !hasOnlyNetwork(objectStoreTools, "data"))
)
  failures.push(
    "object-store tools must use the pinned, isolated AWS CLI tools profile",
  );
for (const [name, service] of Object.entries(services)) {
  if (name === "object-store") continue;
  const garageSecrets = Object.keys(service.environment ?? {}).filter((key) =>
    key.startsWith("GARAGE_"),
  );
  if (garageSecrets.length)
    failures.push(
      `${name} receives Garage secrets: ${garageSecrets.join(", ")}`,
    );
}

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

for (const file of [
  "deploy/prod/Dockerfile.server",
  "deploy/prod/Dockerfile.web",
  "apps/renderer/Dockerfile",
]) {
  const source = readFileSync(file, "utf8");
  if (/COPY\s+[^\n]*(?:\.env|secret)/i.test(source))
    failures.push(`${file} appears to bake an environment or secret file`);
}
if (services["db-migrate"]?.restart !== "no")
  failures.push("migrations must be one-shot");
if (services["db-migrate"]?.image === services.server?.image)
  failures.push("migration and server targets must use distinct image tags");
const serverDockerfile = readFileSync("deploy/prod/Dockerfile.server", "utf8");
if (
  !serverDockerfile.includes("COPY --from=build /out/migrate.js ./migrate.js")
)
  failures.push("migration image must contain the migration entrypoint");
if (
  /\b(?:apt(?:-get)?|apk)\s+[^\n]*\binstall\b[^\n]*\bgit\b/i.test(
    serverDockerfile,
  )
)
  failures.push("server image must not install the Git CLI");

if (failures.length) {
  for (const failure of failures)
    console.error(`production compose policy: ${failure}`);
  process.exit(1);
}
console.log(
  "Dokploy production Compose topology, Garage storage, and durable Git storage policies satisfy assertions.",
);
