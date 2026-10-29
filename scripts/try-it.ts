// Try IT Hub on your own computer with example data: `npm run try`.
// Starts a database in Docker, fills it with a week of made-up jobs, kit, network and people,
// creates two accounts you can sign in with, and runs the app at http://localhost:3000.
// `npm run try -- --reset` throws the example data away and starts again.
// `npm run try -- --phone` makes it reachable from phones on the same Wi-Fi.
// Already have PostgreSQL? Set TRY_DATABASE_URL to an empty database and Docker isn't needed.
import { spawnSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";

const PORT = Number(process.env.PORT) || 3000;
const SECRET_FILE = ".try-secret";
const ADMIN = { name: "Greg J", email: "greg@gardenersdream.co.uk", password: "try-it-hub-admin" };
const STAFF = { name: "Kirsty P", email: "kirsty@gardenersdream.co.uk", password: "try-it-hub-staff" };

function run(cmd: string, args: string[], what: string, env = process.env) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`\n${what} didn't work.${cmd === "docker" ? " Is Docker Desktop installed and running?" : ""}`);
    process.exit(1);
  }
}

const ownDb = process.env.TRY_DATABASE_URL?.trim();
if (!ownDb) {
  if (process.argv.includes("--reset")) {
    console.log("Removing the example database…");
    run("docker", ["compose", "down", "-v"], "Removing the database");
  }
  console.log("Starting the database in Docker (the first time downloads it, which takes a minute)…");
  run("docker", ["compose", "up", "-d", "--wait"], "Starting the database");
} else if (process.argv.includes("--reset")) {
  console.log("--reset only works with the Docker database. Empty your own database by hand instead.");
}

// This computer's address on the local network, for --phone.
const lan = Object.values(networkInterfaces())
  .flat()
  .find((n) => n && n.family === "IPv4" && !n.internal)?.address;
const phone = process.argv.includes("--phone") && lan;
const appUrl = phone ? `http://${lan}:${PORT}` : `http://localhost:${PORT}`;

// Keep the same secret between runs so you stay signed in.
if (!existsSync(SECRET_FILE)) writeFileSync(SECRET_FILE, randomBytes(32).toString("base64url"));
const env = {
  ...process.env,
  DATABASE_URL: ownDb || "postgres://postgres:ithub-try@localhost:5433/ithub_try",
  APP_URL: appUrl,
  BETTER_AUTH_SECRET: readFileSync(SECRET_FILE, "utf8").trim(),
  ALLOWED_EMAIL_DOMAINS: "gardenersdream.co.uk",
  ADMIN_EMAIL: "",
  SMTP_HOST: "",
  SLACK_BOT_TOKEN: "",
  SLACK_CHANNEL: "",
  SLACK_WEBHOOK_URL: "",
  UPLOAD_DIR: "./uploads-try",
  NETWORK_POLL_SECONDS: "60",
  NEXT_TELEMETRY_DISABLED: "1",
};

run("npx", ["tsx", "scripts/migrate.ts"], "Setting up the database", env);
run("npx", ["tsx", "scripts/seed.ts"], "Adding sites and categories", env);
run("npx", ["tsx", "scripts/try-accounts.ts", JSON.stringify({ ADMIN, STAFF })], "Adding the example data", env);
console.log("Building the app (a minute or two)…");
run("npx", ["next", "build"], "Building the app", env);

console.log(`
──────────────────────────────────────────────────────────────
 IT Hub is running at ${appUrl}   (Ctrl+C stops it)

 IT admin   ${ADMIN.email}   password ${ADMIN.password}
            The first sign-in asks you to set up an authenticator
            app on your phone, as a real IT account would.
 Staff      ${STAFF.email}   password ${STAFF.password}

 Use a private window for the second account. Emails print here.
${phone ? ` Open ${appUrl} on your phone too (same Wi-Fi). The camera
 scanner needs https, so type tags on the Scan page instead.` : ` To use it on your phone too: npm run try -- --phone`}
──────────────────────────────────────────────────────────────
`);
const app = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "inherit", env, shell: process.platform === "win32" });
app.on("exit", (code) => process.exit(code ?? 0));
