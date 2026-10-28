// Fills a database with a believable week of example IT jobs, for demos and trying the app.
// Never run this against the live database: everything it adds is made up.
// Usage: DATABASE_URL=postgres://…/ithub_demo npx tsx scripts/demo-data.ts [admin-email] [staff-email]
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import type { Actor, Role } from "../src/lib/roles";
import { dueDates } from "../src/lib/sla";
import { addMessage, createTicket, logTime, rateTicket, updateTicket } from "../src/lib/tickets";

if (/ithub$/.test(process.env.DATABASE_URL ?? "") && !process.argv.includes("--yes")) {
  console.error("This looks like the main database. Point DATABASE_URL at a demo database, or pass --yes.");
  process.exit(1);
}
console.log = () => {}; // keep the printed emails quiet

const [adminEmail = "greg@gardenersdream.co.uk", staffEmail = "kirsty@gardenersdream.co.uk"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));

async function person(name: string, role: Role, email?: string): Promise<Actor> {
  email ??= `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@gardenersdream.co.uk`;
  const existing = await db.query.user.findFirst({ where: eq(schema.user.email, email) });
  if (existing) return { id: existing.id, name: existing.name, email, role: existing.role as Role, phone: existing.phone };
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name, email, role, twoFactorEnabled: role !== "staff" });
  return { id, name, email, role, phone: null };
}

const greg = await person("Greg J", "admin", adminEmail);
const sam = await person("Sam M", "tech");
const ali = await person("Ali R", "tech");
const kirsty = await person("Kirsty P", "staff", staffEmail);
const mark = await person("Mark D", "staff");
const emma = await person("Emma L", "staff");
const hannah = await person("Hannah W", "staff");
const josh = await person("Josh T", "staff");
const dave = await person("Dave K", "staff");
const priya = await person("Priya S", "staff");

const sites = Object.fromEntries((await db.select().from(schema.site)).map((s) => [s.name, s.id]));
const cats = Object.fromEntries((await db.select().from(schema.category)).map((c) => [c.name, c.id]));
const policies = Object.fromEntries((await db.select().from(schema.slaPolicy)).map((p) => [p.priority, p]));

// Example routing so the dashboard shows real names.
await db.delete(schema.assignmentRule);
await db.insert(schema.assignmentRule).values([
  { categoryId: cats.Printer, siteId: sites.Warehouse, assigneeId: greg.id, position: 10 },
  { categoryId: cats.Network, siteId: null, assigneeId: ali.id, position: 20 },
  { categoryId: cats.Onboarding, siteId: null, assigneeId: sam.id, position: 30 },
]);

const MIN = 60_000;
const ago = (min: number) => new Date(Date.now() - min * MIN);

/** Creates a ticket, then moves its clock back so SLAs show a realistic mix. */
async function job(
  by: Actor,
  minutesAgo: number,
  t: { title: string; description: string; priority: number; cat: string; site: string; location: string; phone?: string },
) {
  const row = await createTicket(
    by,
    {
      title: t.title,
      description: t.description,
      priority: t.priority,
      categoryId: cats[t.cat] ?? null,
      siteId: sites[t.site] ?? null,
      location: t.location,
      contactPhone: t.phone ?? `07700 900${String(100 + Math.floor(Math.random() * 800))}`,
    },
    [],
  );
  const createdAt = ago(minutesAgo);
  await db
    .update(schema.ticket)
    .set({ createdAt, updatedAt: createdAt, ...dueDates(createdAt, policies[t.priority]) })
    .where(eq(schema.ticket.id, row.id));
  await db.update(schema.ticketEvent).set({ createdAt }).where(eq(schema.ticketEvent.ticketId, row.id));
  return row.id;
}

/** Runs a step, then dates whatever it wrote to `minutesAgo`. */
async function at(minutesAgo: number, id: number, step: () => Promise<unknown>) {
  const before = new Date();
  await step();
  const when = ago(minutesAgo);
  for (const table of [schema.ticketMessage, schema.ticketEvent, schema.timeEntry]) {
    await db.update(table).set({ createdAt: when }).where(sql`${table.ticketId} = ${id} and ${table.createdAt} >= ${before}`);
  }
  await db.execute(sql`
    update ticket set
      updated_at = ${when},
      first_response_at = case when first_response_at >= ${before} then ${when} else first_response_at end,
      resolved_at = case when resolved_at >= ${before} then ${when} else resolved_at end,
      closed_at = case when closed_at >= ${before} then ${when} else closed_at end
    where id = ${id}`);
}

const DAY = 24 * 60;

// Last week: done and dusted.
const old = [
  await job(priya, 6 * DAY, { title: "Wireless mouse for meeting room 1", description: "The mouse in meeting room 1 has gone missing.", priority: 4, cat: "Request", site: "Head Office", location: "Meeting room 1" }),
  await job(dave, 5 * DAY, { title: "Goods-in scanner not sending to email", description: "Scans go through but never arrive in the shared inbox.", priority: 3, cat: "Printer", site: "Warehouse", location: "Goods in" }),
  await job(mark, 4 * DAY + 120, { title: "Outlook keeps asking for my password", description: "Pops up every 10 minutes since yesterday.", priority: 3, cat: "Software", site: "Head Office", location: "Accounts, desk 4" }),
  await job(emma, 3 * DAY, { title: "Card machine can't connect", description: "Says no network. Customers waiting.", priority: 1, cat: "Network", site: "Showroom", location: "Till 1" }),
];
const fixes = ["Swapped in a spare from the cupboard.", "Scan-to-email password had expired. Updated it.", "Cleared old credentials in Windows. Should be fine now.", "Restarted the switch in the back office. Till is back online."];
const raisedAgo = [6 * DAY, 5 * DAY, 4 * DAY + 120, 3 * DAY];
const answeredAfter = [90, 200, 45, 8]; // minutes after raising
for (const [i, id] of old.entries()) {
  const tech = [sam, greg, sam, ali][i];
  const t = raisedAgo[i] - answeredAfter[i];
  await at(t + 2, id, () => updateTicket(id, greg, { assigneeId: tech.id }));
  await at(t, id, () => addMessage(id, tech, fixes[i], false, []));
  await at(t - 5, id, () => logTime(id, tech, [10, 35, 20, 25][i], ""));
  await at(t - 6, id, () => updateTicket(id, tech, { status: "resolved" }));
}
const raters = [priya, dave, mark, emma];
for (const [i, id] of old.entries()) await at(2 * DAY - i * 60, id, () => rateTicket(id, raters[i], [5, 4, 5, 5][i], ["Thanks!", "", "Quick, cheers", "Saved the day"][i]));
await at(2 * DAY, old[0], () => updateTicket(old[0], greg, { status: "closed" }));

// This week: still open.
const labels = await job(kirsty, 4 * 60 + 25, {
  title: "Label printer in dispatch printing blank labels",
  description: "Labels come out of the Zebra on bench 2 completely blank since about 8am. Bench 1 is fine. We've tried turning it off and on and reloading the roll. Couriers collect at 2pm.",
  priority: 1,
  cat: "Printer",
  site: "Warehouse",
  location: "Dispatch bench 2",
  phone: "07700 900412",
});
await at(4 * 60 + 6, labels, () => addMessage(labels, greg, "On my way over. Please use bench 1 for now.", false, []));
await at(4 * 60 + 5, labels, () => updateTicket(labels, greg, { status: "progress" }));
await at(3 * 60 + 45, labels, () => addMessage(labels, greg, "Printhead looks worn. Spare ZD421 in Warehouse cupboard B, swapping it in.", true, []));
await at(3 * 60 + 40, labels, () => logTime(labels, greg, 40, "Diagnosed printhead"));

const sage = await job(mark, 50, { title: "Can't log in to Sage after password change", description: "Changed my Windows password this morning and now Sage says my login is wrong.", priority: 2, cat: "Software", site: "Head Office", location: "Accounts, desk 4" });
const wifi = await job(emma, 26 * 60, { title: "Wi-Fi drops in the showroom back office", description: "Laptop loses Wi-Fi every 20 minutes or so. Phone does too.", priority: 2, cat: "Network", site: "Showroom", location: "Back office" });
await at(25 * 60, wifi, () => addMessage(wifi, ali, "Can you tell me roughly when it drops next time, and whether the light on the ceiling access point goes orange?", false, []));
await at(25 * 60 - 1, wifi, () => updateTicket(wifi, ali, { status: "waiting" }));
const starter = await job(hannah, 28 * 60, { title: "New starter Monday: laptop, email, Slack", description: "Jamie starts in marketing on Monday. Needs a laptop, email, Slack and access to the shared drive.", priority: 3, cat: "Onboarding", site: "Head Office", location: "HR" });
await at(27 * 60, starter, () => addMessage(starter, sam, "Laptop is imaged. I'll set up email and Slack on Friday.", false, []));
await at(27 * 60, starter, () => updateTicket(starter, sam, { status: "progress" }));
await job(josh, 20 * 60, { title: "Second monitor flickering", description: "The left-hand monitor flickers when I move the mouse quickly.", priority: 3, cat: "Hardware", site: "Head Office", location: "Marketing, desk 9" });
await job(dave, 70, { title: "Toner low on the dispatch laser printer", description: "Printer says toner low. We're on the last spare.", priority: 4, cat: "Printer", site: "Warehouse", location: "Dispatch" });
await job(priya, 12, { title: "Teams camera not working", description: "Camera shows a black square in Teams calls. Fine in the Camera app.", priority: 3, cat: "Software", site: "Head Office", location: "Meeting room 2" });

console.info(`Demo data added: ${old.length + 7} jobs.`);
process.exit(0);
