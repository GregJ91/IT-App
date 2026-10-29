// Fills a database with a believable week of example IT jobs, for demos and trying the app.
// Never run this against the live database: everything it adds is made up.
// Usage: DATABASE_URL=postgres://…/ithub_demo npx tsx scripts/demo-data.ts [admin-email] [staff-email]
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import type { Actor, Role } from "../src/lib/roles";
import { dueDates } from "../src/lib/sla";
import { recomputeOpenTickets } from "../src/lib/sla-rules";
import { addMessage, createTicket, logTime, rateTicket, updateTicket } from "../src/lib/tickets";
import { checkOut, createAsset, type AssetInput } from "../src/lib/assets";
import { saveLicence } from "../src/lib/licences";
import { addDays, ukToday } from "../src/lib/reminders";
import { createStockItem, moveStock } from "../src/lib/stock";

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

// Inventory: kit, cupboard stock and licences.
const types = Object.fromEntries((await db.select().from(schema.assetType)).map((t) => [t.name, t.id]));
const today = ukToday();
const kit = (name: string, type: string, o: Partial<AssetInput>): AssetInput => ({
  name,
  typeId: types[type] ?? null,
  make: "",
  model: "",
  serial: "",
  status: "in_use",
  siteId: null,
  location: "",
  ipAddress: "",
  macAddress: "",
  purchaseDate: null,
  purchaseCostPence: null,
  supplier: "",
  warrantyUntil: null,
  notes: "",
  ...o,
});
const dell = await createAsset(greg, kit("Dell Latitude 5440", "Laptop", { make: "Dell", model: "Latitude 5440", serial: "J7H2XK3", siteId: sites["Head Office"], location: "Accounts", purchaseDate: "2024-03-14", purchaseCostPence: 84900, supplier: "Dell", warrantyUntil: "2027-03-14" }));
await checkOut(greg, dell.id, { userId: mark.id, name: "" }, "with charger and dock");
await createAsset(greg, kit("Lenovo ThinkPad E14", "Laptop", { make: "Lenovo", model: "ThinkPad E14", serial: "PF4KQ21", status: "spare", siteId: sites["Head Office"], location: "IT cupboard", purchaseDate: "2023-11-02", purchaseCostPence: 62900, supplier: "Insight", warrantyUntil: addDays(today, 9) }));
const m507 = await createAsset(greg, kit("Dispatch laser", "Printer", { make: "HP", model: "LaserJet M507", serial: "PHBQ71830", siteId: sites.Warehouse, location: "Dispatch", ipAddress: "10.20.1.31", macAddress: "3C:52:82:1A:7F:04", purchaseDate: "2024-06-30", purchaseCostPence: 41250, supplier: "Insight", warrantyUntil: "2027-06-30" }));
await checkOut(greg, m507.id, { userId: null, name: "Dispatch" });
const zebra = await createAsset(greg, kit("Dispatch bench 2 labels", "Label printer", { make: "Zebra", model: "ZD421", serial: "D4J212905", status: "repair", siteId: sites.Warehouse, location: "Dispatch bench 2", ipAddress: "10.20.1.45", macAddress: "00:07:4D:9E:12:B3", warrantyUntil: "2027-01-11" }));
await createAsset(greg, kit("Accounts MFP", "Printer", { make: "Ricoh", model: "IM C3010", siteId: sites["Head Office"], location: "Accounts", ipAddress: "10.10.1.20", macAddress: "00:26:73:5C:01:9F", supplier: "Ricoh (lease)" }));
await createAsset(greg, kit("Reception printer", "Printer", { make: "Brother", model: "HL-L5210DN", siteId: sites["Head Office"], location: "Reception", ipAddress: "10.10.1.22", macAddress: "3C:2A:F4:88:20:6E" }));
await createAsset(greg, kit("Goods-in scanner", "Scanner", { make: "Fujitsu", model: "fi-8170", serial: "A21C00418", siteId: sites.Warehouse, location: "Goods in", ipAddress: "10.20.1.60", warrantyUntil: "2027-05-05" }));
const pi = await createAsset(greg, kit("Showroom wall display", "Raspberry Pi", { make: "Raspberry Pi", model: "Pi 5 8GB", serial: "b8:27:eb:4c:91:0a", siteId: sites.Showroom, location: "Front window", ipAddress: "10.30.1.50" }));
await checkOut(greg, pi.id, { userId: null, name: "Showroom TV" });
await updateTicket(labels, greg, { assetId: zebra.id });

const shelf = (name: string, category: string, qty: number, min: number, location: string, fits = "", site = "Warehouse") =>
  createStockItem(greg, { name, category, siteId: sites[site] ?? null, location, minQuantity: min, supplier: category === "Toner" ? "Insight" : "Amazon", fits, notes: "" }, qty);
const toner = await shelf("HP 59A toner", "Toner", 2, 2, "Cupboard B, shelf 2", "HP LaserJet M507");
await moveStock(greg, toner.id, { delta: -1, reason: "taken" }, "", labels);
await shelf("Zebra 102 × 152 mm labels", "Labels", 14, 10, "Cupboard B, shelf 1", "Zebra ZD421");
await shelf("Logitech MK295 keyboard and mouse", "Peripherals", 2, 3, "IT cupboard", "", "Head Office");
await shelf("Dell P2425H 24\" monitor", "Screens", 4, 2, "IT cupboard", "", "Head Office");
await shelf("USB-C to HDMI adapter", "Cables", 6, 2, "IT cupboard", "", "Head Office");

await saveLicence(greg, null, { name: "Microsoft 365 Business Standard", supplier: "Microsoft", seats: 48, renewsOn: addDays(today, 20), costPence: 488600, notes: "" });
await saveLicence(greg, null, { name: "Sage 50 Accounts", supplier: "Sage", seats: 3, renewsOn: addDays(today, 140), costPence: 114000, notes: "" });
await saveLicence(greg, null, { name: "gardenersdream.co.uk domain", supplier: "123-reg", seats: null, renewsOn: addDays(today, 61), costPence: 1499, notes: "" });

// Network: the built-in example network, plus a little outage history for the charts.
const [exampleNet] = await db.insert(schema.netConnection).values({ name: "Example network", kind: "example" }).returning();
const { pollConnection } = await import("../src/lib/network/poll");
await pollConnection(exampleNet);
const netSites = await db.select().from(schema.netSite);
const netSite = (name: string) => netSites.find((x) => x.name === name)!.id;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
await db.insert(schema.netEvent).values([
  { netSiteId: netSite("Showroom"), type: "wan_down", at: hoursAgo(76), data: {} },
  { netSiteId: netSite("Showroom"), type: "wan_up", at: hoursAgo(75.3), data: { downMs: 0.7 * 3600_000 } },
  { netSiteId: netSite("Showroom"), type: "wan_down", at: hoursAgo(28), data: {} },
  { netSiteId: netSite("Showroom"), type: "wan_up", at: hoursAgo(27.8), data: { downMs: 0.2 * 3600_000 } },
  { netSiteId: netSite("Warehouse"), type: "wan_down", at: hoursAgo(200), data: {} },
  { netSiteId: netSite("Warehouse"), type: "wan_up", at: hoursAgo(197.5), data: { downMs: 2.5 * 3600_000 } },
]);
const yard = await db.query.netDevice.findFirst({ where: eq(schema.netDevice.name, "AP Yard") });
if (yard) {
  await db.insert(schema.netEvent).values([
    { netSiteId: yard.netSiteId, deviceId: yard.id, type: "device_down", at: hoursAgo(50), data: {} },
    { netSiteId: yard.netSiteId, deviceId: yard.id, type: "device_up", at: hoursAgo(49), data: { downMs: 3600_000 } },
  ]);
}

// Dates were moved back above, so work the deadlines out again from the history.
await recomputeOpenTickets();
console.info(`Demo data added: ${old.length + 7} jobs.`);
process.exit(0);
