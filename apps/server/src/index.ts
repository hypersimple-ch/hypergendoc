import { createApplication } from "./app/app.js";
import { loadServerEnvironment } from "./platform/env.js";

const environment = loadServerEnvironment();
const app = await createApplication(environment);
let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  try {
    await app.closeDependencies();
  } finally {
    process.exit(0);
  }
};
process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
await app.listen({ host: environment.host, port: environment.port });
