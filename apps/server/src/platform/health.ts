import type { FastifyInstance } from "fastify";

export interface HealthCheck {
  readonly name: string;
  check(): Promise<void>;
}
export interface HealthStatus {
  readonly status: "ok" | "degraded";
  readonly checks: Readonly<Record<string, "ok" | "failed">>;
}
export function createHealthChecker(checks: readonly HealthCheck[]) {
  return {
    async check(): Promise<HealthStatus> {
      const results = await Promise.all(
        checks.map(
          async (check) =>
            [
              check.name,
              await check.check().then(
                () => "ok" as const,
                () => "failed" as const,
              ),
            ] as const,
        ),
      );
      const values = Object.fromEntries(results);
      return {
        status: Object.values(values).every((value) => value === "ok")
          ? "ok"
          : "degraded",
        checks: values,
      };
    },
  };
}

/** Registration is intentionally separate from the application composition root. */
export function registerHealthRoutes(
  app: FastifyInstance,
  checker: ReturnType<typeof createHealthChecker>,
): void {
  app.get("/health/ready", async (_request, reply) => {
    const status = await checker.check();
    return reply.status(status.status === "ok" ? 200 : 503).send(status);
  });
}
