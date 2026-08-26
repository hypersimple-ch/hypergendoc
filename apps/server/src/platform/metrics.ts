import type { FastifyInstance } from "fastify";

/**
 * Minimal Prometheus text-format registry with no dependencies. Counters are
 * process-local by design; the scaling guard forbids multiple server replicas
 * (docs/operations/runbook.md), so no shared metric store is required.
 */
export interface ServerMetrics {
  /** Registers request instrumentation and, when enabled, the /metrics route. */
  register(
    app: FastifyInstance,
    options: Readonly<{ enabled: boolean }>,
  ): void;
  recordRender(outcome: "ok" | "error"): void;
  recordGitMutation(operation: string): void;
  render(): string;
}

const escapeLabel = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

const family = (
  lines: string[],
  name: string,
  help: string,
): void => {
  lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`);
};

export function createServerMetrics(): ServerMetrics {
  const httpRequests = new Map<string, number>();
  const renders = new Map<string, number>([
    ["ok", 0],
    ["error", 0],
  ]);
  const gitMutations = new Map<string, number>();
  const startMs = Date.now();

  const increment = (counter: Map<string, number>, label: string) =>
    counter.set(label, (counter.get(label) ?? 0) + 1);

  return {
    register(app, options) {
      // Route templates come from Fastify routing; raw URLs with identifiers
      // never become labels. Unmatched requests carry no template and are
      // skipped instead of inventing a high-cardinality fallback label.
      app.addHook("onResponse", async (request, reply) => {
        const route = request.routeOptions.url;
        if (!route) return;
        increment(
          httpRequests,
          `${request.method}|${route}|${reply.statusCode}`,
        );
      });
      if (!options.enabled) return;
      app.get("/metrics", (_request, reply) =>
        reply.type("text/plain; version=0.0.4; charset=utf-8").send(render()),
      );
    },
    recordRender(outcome) {
      increment(renders, outcome);
    },
    recordGitMutation(operation) {
      increment(gitMutations, operation);
    },
    render,
  };

  function render(): string {
    const lines: string[] = [];
    family(
      lines,
      "http_requests_total",
      "Total HTTP requests by method, route template, and status code.",
    );
    for (const [key, count] of [...httpRequests].sort(sortKeys)) {
      const parts = key.split("|");
      const method = parts[0] ?? "";
      const route = parts[1] ?? "";
      lines.push(
        `http_requests_total{method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${parts[2]}"} ${count}`,
      );
    }
    family(
      lines,
      "document_renders_total",
      "Total renderer invocations by outcome.",
    );
    for (const outcome of ["ok", "error"] as const)
      lines.push(`document_renders_total{outcome="${outcome}"} ${renders.get(outcome) ?? 0}`);
    family(
      lines,
      "git_mutations_total",
      "Total durable Git mutations by store operation.",
    );
    for (const [operation, count] of [...gitMutations].sort(sortKeys))
      lines.push(`git_mutations_total{operation="${escapeLabel(operation)}"} ${count}`);
    lines.push(
      "# HELP process_uptime_seconds Server process uptime in seconds.",
      "# TYPE process_uptime_seconds gauge",
      `process_uptime_seconds ${((Date.now() - startMs) / 1000).toFixed(3)}`,
    );
    return `${lines.join("\n")}\n`;
  }

  function sortKeys(a: [string, number], b: [string, number]): number {
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  }
}
