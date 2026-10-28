import { execSync } from "node:child_process";
import { Pool } from "pg";
import { startFakeSlack } from "../fake-slack";

// Empty database with migrations and placeholder data applied.
export default async function setup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:5432/ithub_e2e";
  const pool = new Pool({ connectionString: url });
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await pool.end();
  const env = { ...process.env, DATABASE_URL: url, ADMIN_EMAIL: "", APP_URL: "http://localhost:3100" };
  execSync("npx tsx scripts/migrate.ts && npx tsx scripts/seed.ts", { env, stdio: "inherit" });

  // Stand-in Slack for the app to talk to during the run.
  const slack = await startFakeSlack(3199, { "greg@gardenersdream.co.uk": "UGREG", "kirsty@gardenersdream.co.uk": "UKIRSTY" });
  return () => slack.close();
}
