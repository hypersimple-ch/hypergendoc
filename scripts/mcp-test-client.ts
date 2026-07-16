/* Standalone, opt-in MCP smoke client. Supply the one-time credential at runtime. */
async function main(): Promise<void> {
  const origin = process.env.MCP_ORIGIN;
  const token = process.env.MCP_TOKEN;
  if (!origin || !token)
    throw new Error(
      "MCP_ORIGIN and MCP_TOKEN are required; credentials are never stored",
    );

  const response = await fetch(new URL("/mcp", origin), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });
  if (!response.ok) throw new Error(`MCP returned ${response.status}`);
  process.stdout.write(`${await response.text()}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "MCP smoke test failed"}\n`,
  );
  process.exitCode = 1;
});
