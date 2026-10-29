// Used by `npm run try`: creates the two sign-in accounts and the example data, once.
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { spawnSync } from "node:child_process";
import { db, schema } from "../src/db";

type Who = { name: string; email: string; password: string };
const { ADMIN, STAFF } = JSON.parse(process.argv[2]) as { ADMIN: Who; STAFF: Who };

const already = await db.query.user.findFirst({ where: eq(schema.user.email, ADMIN.email) });
if (already) {
  console.log("Example data is already there. (npm run try -- --reset starts again.)");
  process.exit(0);
}

for (const [who, role] of [[ADMIN, "admin"], [STAFF, "staff"]] as const) {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: who.name, email: who.email, emailVerified: true, role });
  await db.insert(schema.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(who.password) });
}

const r = spawnSync("npx", ["tsx", "scripts/demo-data.ts", ADMIN.email, STAFF.email], { stdio: "inherit", env: process.env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
