import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const directory = new URL("../packages/db/migrations/", import.meta.url);
if (!existsSync(directory)) {
  console.log("No migrations yet; schema phase has not started.");
  process.exit(0);
}

const names = (await readdir(directory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
for (const name of names) {
  const sql = await readFile(new URL(name, directory), "utf8");
  if (sql.trim().length === 0) throw new Error(`Empty migration: ${name}`);
}

if (new Set(names).size !== names.length)
  throw new Error("Duplicate migration names");
console.log(`Validated ${names.length} ordered SQL migration(s).`);
