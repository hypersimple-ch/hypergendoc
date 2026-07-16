import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  companies,
  createDatabase,
  users,
  withPurgeTransaction,
  workspaces,
  type Database,
} from "@hypergendoc/db";
import type { StyleDefinition } from "@hypergendoc/contracts";
import { createStyleRepository } from "./repository.js";

const databaseUrl = process.env.HYPERGENDOC_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
let db: Database;
let close: () => Promise<void>;
const definition = { logoObjectId: null } as StyleDefinition;

integration("style repository PostgreSQL integration", () => {
  beforeAll(() => {
    const connection = createDatabase({ connectionString: databaseUrl });
    db = connection.db;
    close = () => connection.pool.end();
  });
  afterAll(() => close());

  it("uses the transaction-bound repository and serializes concurrent version allocation", async () => {
    const workspaceId = randomUUID();
    const companyId = randomUUID();
    const userId = `style-test-${randomUUID()}`;
    await db.insert(users).values({
      id: userId,
      name: "Style Test",
      email: `${userId}@example.test`,
    });
    await db.insert(workspaces).values({ id: workspaceId, name: "style test" });
    await db
      .insert(companies)
      .values({ id: companyId, workspaceId, name: "company" });
    try {
      const repository = createStyleRepository(db);
      const created = await repository.transaction(async (tx) => {
        const style = await tx.createStyle({
          workspaceId,
          companyId,
          name: "brand",
        });
        const version = await tx.createNextVersion({
          workspaceId,
          styleId: style.id,
          definition,
          createdByUserId: userId,
        });
        await tx.setActiveVersion(workspaceId, style.id, version.id);
        return style;
      });
      await Promise.all(
        Array.from({ length: 6 }, () =>
          createStyleRepository(db).transaction((tx) =>
            tx.createNextVersion({
              workspaceId,
              styleId: created.id,
              definition,
              createdByUserId: userId,
            }),
          ),
        ),
      );
      expect(
        (await repository.listVersions(workspaceId, created.id)).map(
          (item) => item.version,
        ),
      ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    } finally {
      await withPurgeTransaction(db, async (tx) => {
        await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
        await tx.delete(users).where(eq(users.id, userId));
      });
    }
  });
});
