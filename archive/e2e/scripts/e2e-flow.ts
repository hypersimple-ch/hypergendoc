import {
  api,
  assert,
  createOwner,
  createVerifiedUser,
  mcp,
  origin,
  pool,
  request,
  restartServerForPersistenceCheck,
  run,
  styleDefinition,
  verifyAuthBoundaries,
  tool,
  type Json,
} from "./e2e-support.js";

async function main(): Promise<void> {
  try {
    const ownerA = await createOwner("A");
    const ownerB = await createOwner("B");
    const workspaceA = await api(
      ownerA,
      "/api/workspaces",
      "POST",
      { name: `Agency A ${run}` },
      201,
    );
    const workspaceB = await api(
      ownerB,
      "/api/workspaces",
      "POST",
      { name: `Agency B ${run}` },
      201,
    );
    assert(workspaceA.id !== workspaceB.id, "Workspaces must be isolated");
    const memberEmail = await createVerifiedUser("member", "A");
    const member = await api(
      ownerA,
      "/api/workspaces/current/members",
      "POST",
      { email: memberEmail, role: "member" },
      201,
    );

    assert(member.role === "member", "Member fixture was not provisioned");

    const companyA1 = await api(
      ownerA,
      "/api/companies",
      "POST",
      { name: `Client A1 ${run}` },
      201,
    );
    const companyA2 = await api(
      ownerA,
      "/api/companies",
      "POST",
      { name: `Client A2 ${run}` },
      201,
    );
    const companyB = await api(
      ownerB,
      "/api/companies",
      "POST",
      { name: `Client B ${run}` },
      201,
    );
    const companyA1Id = String(companyA1.id);
    const companyA2Id = String(companyA2.id);
    const companyBId = String(companyB.id);
    const csrfAttempt = await fetch(new URL("/api/companies", origin), {
      method: "POST",
      headers: {
        Cookie: ownerA.cookie,
        Origin: "https://attacker.example.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "CSRF company" }),
    });
    assert(csrfAttempt.status === 403, "Cross-origin mutation was accepted");

    const styleA = await api(
      ownerA,
      `/api/companies/${companyA1Id}/styles`,
      "POST",
      { name: "Proposal", definition: styleDefinition },
      201,
    );
    const styleB = await api(
      ownerB,
      `/api/companies/${companyBId}/styles`,
      "POST",
      { name: "Proposal", definition: styleDefinition },
      201,
    );
    const styleARecord = styleA.style as Json;
    const styleAVersion1 = styleA.version as Json;
    const styleBRecord = styleB.style as Json;

    const credentialA = await api(
      ownerA,
      "/api/mcp-credentials",
      "POST",
      {
        name: "E2E agent A",
        companyIds: [companyA1Id],
        actions: [
          "companies:read",
          "styles:read",
          "documents:read",
          "documents:write",
        ],
      },
      201,
    );
    const credentialB = await api(
      ownerB,
      "/api/mcp-credentials",
      "POST",
      {
        name: "E2E agent B",
        companyIds: [companyBId],
        actions: [
          "companies:read",
          "styles:read",
          "documents:read",
          "documents:write",
        ],
      },
      201,
    );
    const credentialRate = await api(
      ownerA,
      "/api/mcp-credentials",
      "POST",
      {
        name: "E2E rate-limit agent",
        companyIds: [companyA2Id],
        actions: ["companies:read"],
      },
      201,
    );
    const tokenA = String(credentialA.token);
    const tokenB = String(credentialB.token);
    const tokenRate = String(credentialRate.token);
    assert(
      tokenA.startsWith("hgd_") &&
        tokenB.startsWith("hgd_") &&
        tokenRate.startsWith("hgd_"),
      "Missing one-time keys",
    );

    const tools = await mcp(tokenA, 1, "tools/list", {});
    const toolList = (tools.result as Json).tools as Json[];
    assert(toolList.length === 7, "Expected seven MVP MCP tools");
    const visible = await tool(tokenA, 2, "list_companies", {});
    const visibleItems = visible.items as Json[];
    assert(
      visibleItems.length === 1 && visibleItems[0]?.id === companyA1Id,
      "Scoped key exposed another company",
    );
    assert(
      !visibleItems.some((item) => item.id === companyA2Id),
      "A2 leaked to A1 key",
    );

    const createdA = await tool(tokenA, 3, "create_document", {
      companyId: companyA1Id,
      styleId: String(styleARecord.id),
      title: "Website proposal",
      body: "\\section{Overview}\nA focused proposal.",
    });
    const documentAId = String(createdA.id);
    const createdB = await tool(tokenB, 4, "create_document", {
      companyId: companyBId,
      styleId: String(styleBRecord.id),
      title: "Private B proposal",
      body: "\\section{Overview}\nTenant B only.",
    });
    const documentBId = String(createdB.id);

    const detail1 = await api(ownerA, `/api/documents/${documentAId}`);
    const versions1 = detail1.versions as Json[];
    assert(
      versions1.length === 1 && versions1[0]?.status === "ready",
      "Version 1 not ready",
    );
    assert(
      versions1[0]?.styleVersionId === styleAVersion1.id,
      "Version 1 did not pin style version 1",
    );

    const styleA2 = await api(
      ownerA,
      `/api/styles/${String(styleARecord.id)}/versions`,
      "POST",
      {
        definition: {
          ...styleDefinition,
          colors: { ...styleDefinition.colors, primary: "#0057B8" },
        },
        activate: true,
      },
      201,
    );
    const inherited = await tool(tokenA, 5, "create_document_version", {
      documentId: documentAId,
      body: "\\section{Overview}\nRevision using the pinned style.",
    });
    assert(
      inherited.styleVersionId === styleAVersion1.id,
      "Revision silently changed the pinned style",
    );
    const restyled = await tool(tokenA, 6, "create_document_version", {
      documentId: documentAId,
      styleVersionId: String(styleA2.id),
      body: "\\section{Overview}\nExplicitly restyled revision.",
    });
    assert(
      restyled.styleVersionId === styleA2.id,
      "Explicit restyle was not recorded",
    );

    const downloadable = await tool(tokenA, 7, "get_document_version", {
      documentId: documentAId,
      version: 3,
    });
    const downloadUrl = String(downloadable.downloadUrl);
    const agentArtifact = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(
      agentArtifact.status === 200,
      `MCP artifact download returned ${agentArtifact.status}`,
    );
    assert(
      Buffer.from(await agentArtifact.arrayBuffer())
        .subarray(0, 5)
        .toString() === "%PDF-",
      "MCP artifact was not a PDF",
    );
    const foreignAgentArtifact = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(
      foreignAgentArtifact.status === 404,
      "Foreign MCP credential downloaded an artifact",
    );

    const detail3 = await api(ownerA, `/api/documents/${documentAId}`);
    const versions3 = detail3.versions as Json[];
    assert(
      versions3.length === 3,
      "Dashboard history did not show all versions",
    );
    const artifact = await request(
      `/api/documents/${documentAId}/versions/3/pdf`,
      { session: ownerA, redirect: "manual" },
    );
    assert(artifact.status === 200, "Private artifact proxy failed");
    assert(
      artifact.headers.get("cache-control")?.includes("no-store"),
      "Private artifact was cacheable",
    );
    assert(
      Buffer.from(await artifact.arrayBuffer())
        .subarray(0, 5)
        .toString() === "%PDF-",
      "Private artifact was not a PDF",
    );
    const foreignArtifact = await request(
      `/api/documents/${documentAId}/versions/3/pdf`,
      { session: ownerB, redirect: "manual" },
    );
    assert(foreignArtifact.status === 404, "Cross-tenant artifact was exposed");

    const logo = new FormData();
    logo.set(
      "file",
      new Blob([
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        ),
      ]),
      "logo.png",
    );
    const logoUpload = await fetch(
      new URL(`/api/companies/${companyA1Id}/logo`, origin),
      {
        method: "POST",
        headers: { Cookie: ownerA.cookie, Origin: origin },
        body: logo,
      },
    );
    assert(logoUpload.status === 201, "Authorized logo upload failed");
    const polyglotLogo = new FormData();
    polyglotLogo.set(
      "file",
      new Blob([
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        ),
        Buffer.from("<script>polyglot</script>"),
      ]),
      "polyglot.png",
    );
    const polyglotUpload = await fetch(
      new URL(`/api/companies/${companyA1Id}/logo`, origin),
      {
        method: "POST",
        headers: { Cookie: ownerA.cookie, Origin: origin },
        body: polyglotLogo,
      },
    );
    assert(polyglotUpload.status === 400, "Logo polyglot was accepted");
    const oversizedLogo = new FormData();
    oversizedLogo.set(
      "file",
      new Blob([
        Buffer.from("89504e470d0a1a0a", "hex"),
        new Uint8Array(10 * 1024 * 1024),
      ]),
      "oversized.png",
    );
    const oversizedUpload = await fetch(
      new URL(`/api/companies/${companyA1Id}/logo`, origin),
      {
        method: "POST",
        headers: { Cookie: ownerA.cookie, Origin: origin },
        body: oversizedLogo,
      },
    );
    assert(oversizedUpload.status === 413, "Logo size limit was not enforced");
    const foreignLogo = await fetch(
      new URL(`/api/companies/${companyA1Id}/logo`, origin),
      {
        method: "POST",
        headers: { Cookie: ownerB.cookie, Origin: origin },
        body: logo,
      },
    );
    assert(foreignLogo.status === 404, "Cross-tenant logo upload was allowed");

    const concurrent = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        tool(tokenA, 10 + index, "create_document_version", {
          documentId: documentAId,
          body: `\\section{Concurrent ${index}}\nSerialized revision ${index}.`,
        }),
      ),
    );
    assert(
      concurrent
        .map((version) => version.version)
        .sort()
        .join(",") === "4,5,6,7",
      "Concurrent versions were not serialized",
    );
    assert(
      concurrent.every((version) => version.status === "ready"),
      "Concurrent render did not complete",
    );

    const crossTenant = await mcp(tokenA, 20, "tools/call", {
      name: "get_document",
      arguments: { documentId: documentBId },
    });
    assert(
      (crossTenant.result as Json).isError === true,
      "Cross-tenant document was exposed",
    );

    await api(
      ownerA,
      `/api/mcp-credentials/${String((credentialA.credential as Json).id)}`,
      "DELETE",
      undefined,
      204,
    );
    await restartServerForPersistenceCheck();
    await mcp(tokenA, 21, "tools/list", {}, 401);
    const revokedArtifact = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(
      revokedArtifact.status === 401,
      "Revoked MCP credential retained artifact access",
    );

    for (let index = 0; index < 60; index += 1)
      await mcp(tokenRate, 100 + index, "tools/list", {});
    const limited = await fetch(new URL("/mcp", origin), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenRate}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 160, method: "tools/list" }),
    });
    assert(
      limited.status === 429,
      "MCP credential rate limit was not enforced",
    );

    const oversizedMcp = await fetch(new URL("/mcp", origin), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenB}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 200,
        method: "tools/call",
        params: {
          name: "list_companies",
          arguments: { padding: "x".repeat(270_000) },
        },
      }),
    });
    assert(
      oversizedMcp.status === 413,
      `MCP request body limit returned ${oversizedMcp.status}, expected 413`,
    );

    const audit = await pool.query<{ action: string; actor_type: string }>(
      "SELECT action, actor_type FROM audit_events WHERE workspace_id = $1",
      [workspaceA.id],
    );
    const auditActions = new Set(audit.rows.map((event) => event.action));
    for (const action of [
      "company.created",
      "style.created",
      "style.version_created",
      "mcp_credential.created",
      "mcp_credential.used",
      "mcp_credential.revoked",
      "document.create",
      "document.version.create",
      "document.pdf.access",
    ])
      assert(auditActions.has(action), `Missing audit action: ${action}`);
    assert(
      audit.rows.some(
        (event) =>
          event.action === "document.version.create" &&
          event.actor_type === "credential",
      ),
      "Audit actor attribution was incomplete",
    );

    await verifyAuthBoundaries(memberEmail);

    process.stdout.write(
      `${JSON.stringify({
        status: "ok",
        run,
        fixtures: {
          workspaceA: workspaceA.id,
          workspaceB: workspaceB.id,
          memberA: member.id,
          companyA1: companyA1Id,
          companyA2: companyA2Id,
          companyB: companyBId,
          documentA: documentAId,
          documentB: documentBId,
        },
        note: "Renderer isolation is evidenced separately by e2e:renderer and container inspection.",
      })}\n`,
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "E2E flow failed"}\n`,
  );
  process.exitCode = 1;
});
