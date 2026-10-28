// Sets up placeholder sites, categories and SLA targets, then prints an invite
// link for the first IT admin. Safe to run more than once.
import "dotenv/config";
import { count, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { createInvite, inviteUrl } from "../src/lib/invites";
import { DEFAULT_SETTINGS, saveSlaSettings } from "../src/lib/sla-rules";

const SITES = ["Head Office", "Warehouse", "Showroom"]; // placeholders until real names are confirmed
const CATEGORIES = ["Hardware", "Software", "Network", "Printer", "Onboarding", "Request", "Other"];
// Critical and High count any time; Normal and Low only in working hours.
const SLA = [
  { priority: 1, label: "Critical", responseMinutes: 15, resolveMinutes: 4 * 60, counts: "any" },
  { priority: 2, label: "High", responseMinutes: 60, resolveMinutes: 24 * 60, counts: "any" },
  { priority: 3, label: "Normal", responseMinutes: 4 * 60, resolveMinutes: 3 * 24 * 60, counts: "hours" },
  { priority: 4, label: "Low", responseMinutes: 24 * 60, resolveMinutes: 5 * 24 * 60, counts: "hours" },
];

await db
  .insert(schema.site)
  .values(SITES.map((name, position) => ({ name, position })))
  .onConflictDoNothing();
await db
  .insert(schema.category)
  .values(CATEGORIES.map((name, position) => ({ name, position })))
  .onConflictDoNothing();
await db.insert(schema.slaPolicy).values(SLA).onConflictDoNothing();

// Working hours: 5am to 9pm, every day (UK time). Only set the first time.
const hadHours = await db.query.appSetting.findFirst({ where: sql`${schema.appSetting.key} = 'workingHours'` });
if (!hadHours) {
  await saveSlaSettings(DEFAULT_SETTINGS);
  await db.execute(sql`update sla_policy set counts = 'hours' where priority in (3, 4)`);
}

// Ticket numbers start at IT-1001.
const [{ n }] = await db.select({ n: count() }).from(schema.ticket);
if (n === 0) await db.execute(sql`alter sequence ticket_id_seq restart with 1001`);

const email = process.env.ADMIN_EMAIL?.trim();
const [{ admins }] = await db.select({ admins: count() }).from(schema.user).where(sql`${schema.user.role} = 'admin'`);
if (email && admins === 0) {
  const { token } = await createInvite({ email, name: process.env.ADMIN_NAME || email, role: "admin", invitedById: null });
  console.log(`\nFirst IT admin invite for ${email} (valid 7 days):\n${inviteUrl(token)}\n`);
} else if (!email && admins === 0) {
  console.log("\nSet ADMIN_EMAIL in .env and run this again to get the first IT admin invite link.\n");
}
console.log("Seed done.");
process.exit(0);
