import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

/** Creates an owned pool. Call `pool.end()` during process shutdown. */
export function createDatabase(config: PoolConfig): {
  db: Database;
  pool: Pool;
} {
  const pool = new Pool(config);
  return { db: drizzle({ client: pool, schema }), pool };
}

/** Runs an authorized purge with deletes enabled only for this transaction. */
export async function withPurgeTransaction<T>(
  db: Database,
  operation: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local hypergendoc.allow_purge = 'on'`);
    return operation(tx);
  });
}

/** Applies the checked-in, versioned Drizzle migrations. */
export async function migrateDatabase(
  db: Database,
  migrationsFolder: string,
): Promise<void> {
  await migrate(db, { migrationsFolder });
}
