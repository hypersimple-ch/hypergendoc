import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@hypergendoc/db";
import { companies, mcpCompanyScopes, mcpCredentials } from "@hypergendoc/db";
import type { McpAction, McpCredential } from "@hypergendoc/contracts";
import type { CredentialOperations, CredentialRepository } from "./service.js";

type Db = Database;
type CredentialRow = typeof mcpCredentials.$inferSelect;
const dates = (value: Date | null) => value?.toISOString() ?? null;

async function hydrate(
  db: Db,
  rows: readonly CredentialRow[],
): Promise<McpCredential[]> {
  if (rows.length === 0) return [];
  const scopes = await db
    .select()
    .from(mcpCompanyScopes)
    .where(
      inArray(
        mcpCompanyScopes.credentialId,
        rows.map((row) => row.id),
      ),
    );
  const companiesByCredential = new Map<string, string[]>();
  for (const scope of scopes) {
    const values = companiesByCredential.get(scope.credentialId) ?? [];
    values.push(scope.companyId);
    companiesByCredential.set(scope.credentialId, values);
  }
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    prefix: row.lookupPrefix,
    companyIds: companiesByCredential.get(row.id) ?? [],
    actions: row.actions as McpAction[],
    expiresAt: dates(row.expiresAt),
    revokedAt: dates(row.revokedAt),
    lastUsedAt: dates(row.lastUsedAt),
    createdAt: row.createdAt.toISOString(),
  }));
}

function operations(db: Db): CredentialOperations {
  return {
    async companiesExist(workspaceId, companyIds) {
      if (companyIds.length === 0) return false;
      const rows = await db
        .select({ id: companies.id })
        .from(companies)
        .where(
          and(
            eq(companies.workspaceId, workspaceId),
            inArray(companies.id, companyIds),
          ),
        );
      return rows.length === new Set(companyIds).size;
    },
    async insert(input) {
      const [row] = await db
        .insert(mcpCredentials)
        .values({
          workspaceId: input.workspaceId,
          name: input.name,
          lookupPrefix: input.lookupPrefix,
          tokenHash: input.tokenHash,
          actions: [...input.actions],
          expiresAt: input.expiresAt,
          createdByUserId: input.createdByUserId,
        })
        .returning();
      if (!row) throw new Error("credential insert did not return a row");
      await db.insert(mcpCompanyScopes).values(
        input.companyIds.map((companyId) => ({
          workspaceId: input.workspaceId,
          credentialId: row.id,
          companyId,
        })),
      );
      const [credential] = await hydrate(db, [row]);
      if (!credential) throw new Error("credential hydration failed");
      return credential;
    },
    async list(workspaceId) {
      const rows = await db
        .select()
        .from(mcpCredentials)
        .where(eq(mcpCredentials.workspaceId, workspaceId));
      return hydrate(db, rows);
    },
    async findByLookupPrefix(lookupPrefix) {
      // Prefixes are globally unique; the returned record always carries its DB workspace and scopes.
      const [row] = await db
        .select()
        .from(mcpCredentials)
        .where(eq(mcpCredentials.lookupPrefix, lookupPrefix));
      if (!row) return undefined;
      const [credential] = await hydrate(db, [row]);
      return credential && { ...credential, tokenHash: row.tokenHash };
    },
    async find(workspaceId, credentialId) {
      const [row] = await db
        .select()
        .from(mcpCredentials)
        .where(
          and(
            eq(mcpCredentials.workspaceId, workspaceId),
            eq(mcpCredentials.id, credentialId),
          ),
        );
      if (!row) return undefined;
      return (await hydrate(db, [row]))[0];
    },
    async replaceScopes(input) {
      return db.transaction(async (tx) => {
        const scoped = operations(tx);
        const existing = await scoped.find(
          input.workspaceId,
          input.credentialId,
        );
        if (!existing) return undefined;
        await tx
          .delete(mcpCompanyScopes)
          .where(
            and(
              eq(mcpCompanyScopes.workspaceId, input.workspaceId),
              eq(mcpCompanyScopes.credentialId, input.credentialId),
            ),
          );
        await tx.insert(mcpCompanyScopes).values(
          input.companyIds.map((companyId) => ({
            workspaceId: input.workspaceId,
            credentialId: input.credentialId,
            companyId,
          })),
        );
        const [row] = await tx
          .update(mcpCredentials)
          .set({ actions: [...input.actions], expiresAt: input.expiresAt })
          .where(
            and(
              eq(mcpCredentials.workspaceId, input.workspaceId),
              eq(mcpCredentials.id, input.credentialId),
            ),
          )
          .returning();
        return row ? (await hydrate(tx, [row]))[0] : undefined;
      });
    },
    async revoke(workspaceId, credentialId, revokedAt) {
      const rows = await db
        .update(mcpCredentials)
        .set({ revokedAt })
        .where(
          and(
            eq(mcpCredentials.workspaceId, workspaceId),
            eq(mcpCredentials.id, credentialId),
          ),
        )
        .returning({ id: mcpCredentials.id });
      return rows.length === 1;
    },
    async touchLastUsed(workspaceId, credentialId, usedAt) {
      await db
        .update(mcpCredentials)
        .set({ lastUsedAt: usedAt })
        .where(
          and(
            eq(mcpCredentials.workspaceId, workspaceId),
            eq(mcpCredentials.id, credentialId),
          ),
        );
    },
  };
}

export function createCredentialRepository(db: Database): CredentialRepository {
  const root = operations(db);
  return {
    ...root,
    transaction: (operation) =>
      db.transaction((tx) => operation(operations(tx as Db))),
  };
}
