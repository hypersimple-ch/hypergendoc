import { resolve } from "node:path";
import { createDatabase, migrateDatabase } from "./client.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const { db, pool } = createDatabase({ connectionString: databaseUrl });
try {
  await migrateDatabase(db, resolve(process.cwd(), "migrations"));
} finally {
  await pool.end();
}
