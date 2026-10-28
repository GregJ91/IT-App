import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Fresh schema in the test database before the run.
export default async function setup() {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/ithub_test" });
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
