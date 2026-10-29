// Starters and leavers: a checklist per person, with kit handed out or collected through the inventory.
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { checkIn, checkOut } from "./assets";
import { addDays, daysBetween, ukToday } from "./reminders";
import type { Actor } from "./roles";
import { isITRole } from "./roles";

const { peopleChange, peopleTask, peopleTemplateTask, asset, assetType, site, user } = schema;

export class PeopleError extends Error {}

export type ChangeKind = "starter" | "leaver";
export const isChangeKind = (s: string): s is ChangeKind => s === "starter" || s === "leaver";
export const KIND_LABEL: Record<ChangeKind, string> = { starter: "Starter", leaver: "Leaver" };

/** "Starts in 3 days", "Left yesterday"… */
export function dayText(days: number, kind: string) {
  const verb = kind === "starter" ? "Starts" : "Leaves";
  const past = kind === "starter" ? "Started" : "Left";
  if (days === 0) return `${verb} today`;
  if (days === 1) return `${verb} tomorrow`;
  if (days > 1) return `${verb} in ${days} days`;
  return `${past} ${-days} day${days === -1 ? "" : "s"} ago`;
}

const requireIT = (actor: Actor) => {
  if (!isITRole(actor.role)) throw new PeopleError("Only the IT team can manage starters and leavers.");
};

/* ---------- checklist templates ---------- */

export async function templateTasks(kind?: ChangeKind) {
  return db
    .select()
    .from(peopleTemplateTask)
    .where(and(eq(peopleTemplateTask.archived, false), kind ? eq(peopleTemplateTask.kind, kind) : undefined))
    .orderBy(asc(peopleTemplateTask.sort), asc(peopleTemplateTask.id));
}

export async function addTemplateTask(actor: Actor, kind: ChangeKind, title: string) {
  requireIT(actor);
  const t = title.trim();
  if (!t) throw new PeopleError("Type the task first.");
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${peopleTemplateTask.sort}), 0)` }).from(peopleTemplateTask).where(eq(peopleTemplateTask.kind, kind));
  await db.insert(peopleTemplateTask).values({ kind, title: t.slice(0, 200), sort: Number(max) + 10 });
}

export async function removeTemplateTask(actor: Actor, id: number) {
  requireIT(actor);
  await db.update(peopleTemplateTask).set({ archived: true }).where(eq(peopleTemplateTask.id, id));
}

/* ---------- people ---------- */

export type ChangeInput = {
  kind: ChangeKind;
  name: string;
  email: string;
  userId?: string | null;
  jobTitle: string;
  siteId: number | null;
  manager: string;
  date: string;
  notes: string;
};

async function accountFor(email: string) {
  if (!email) return null;
  const u = await db.query.user.findFirst({ where: sql`lower(${user.email}) = ${email.toLowerCase()}`, columns: { id: true } });
  return u?.id ?? null;
}

/** Kit a leaver has: assigned to their account, or by name to someone without one. */
export async function kitHeldBy(p: { userId: string | null; name: string }) {
  const conds = [p.name.trim() ? ilike(asset.assignedTo, p.name.trim()) : undefined, p.userId ? eq(asset.assignedUserId, p.userId) : undefined].filter(Boolean);
  if (!conds.length) return [];
  return db
    .select({ id: asset.id, tag: asset.tag, name: asset.name })
    .from(asset)
    .where(and(ne(asset.status, "retired"), or(...conds)))
    .orderBy(asc(asset.tag));
}

const kitTitle = (kind: "kit_out" | "kit_back", a: { tag: string; name: string }) => `${kind === "kit_out" ? "Hand out" : "Collect"} ${a.tag} ${a.name}`;

export async function createChange(actor: Actor, input: ChangeInput, kitAssetIds: number[] = []) {
  requireIT(actor);
  const name = input.name.trim();
  if (!name) throw new PeopleError("Add their name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new PeopleError(input.kind === "starter" ? "Add their first day." : "Add their last day.");
  const email = input.email.trim().toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new PeopleError("That email address doesn't look right.");
  const userId = input.userId || (await accountFor(email));

  const [row] = await db
    .insert(peopleChange)
    .values({ ...input, name, email, userId, jobTitle: input.jobTitle.trim(), manager: input.manager.trim(), notes: input.notes.trim(), createdById: actor.id })
    .returning();

  const tasks: (typeof peopleTask.$inferInsert)[] = (await templateTasks(input.kind)).map((t) => ({ changeId: row.id, title: t.title, sort: t.sort }));
  if (input.kind === "starter") {
    const kit = kitAssetIds.length ? await db.select({ id: asset.id, tag: asset.tag, name: asset.name }).from(asset).where(inArray(asset.id, kitAssetIds)) : [];
    kit.forEach((a, i) => tasks.push({ changeId: row.id, title: kitTitle("kit_out", a), kind: "kit_out", assetId: a.id, sort: 1000 + i }));
  } else {
    (await kitHeldBy({ userId, name })).forEach((a, i) => tasks.push({ changeId: row.id, title: kitTitle("kit_back", a), kind: "kit_back", assetId: a.id, sort: 1000 + i }));
  }
  if (tasks.length) await db.insert(peopleTask).values(tasks);
  return row;
}

export async function updateChange(actor: Actor, id: number, input: Omit<ChangeInput, "kind">) {
  requireIT(actor);
  if (!input.name.trim()) throw new PeopleError("Add their name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new PeopleError("Add the date.");
  const email = input.email.trim().toLowerCase();
  const before = await db.query.peopleChange.findFirst({ where: eq(peopleChange.id, id) });
  if (!before) throw new PeopleError("Not found.");
  await db
    .update(peopleChange)
    .set({ ...input, name: input.name.trim(), email, userId: before.userId ?? (await accountFor(email)) })
    .where(eq(peopleChange.id, id));
}

export async function setChangeStatus(actor: Actor, id: number, status: "open" | "cancelled") {
  requireIT(actor);
  await db.update(peopleChange).set({ status, doneAt: null }).where(eq(peopleChange.id, id));
  if (status === "open") await refreshDone(id);
}

/** Done when every task is ticked; unticking one reopens it. Cancelled ones stay cancelled. */
async function refreshDone(changeId: number) {
  const c = await db.query.peopleChange.findFirst({ where: eq(peopleChange.id, changeId) });
  if (!c || c.status === "cancelled") return;
  const [{ open, total }] = await db
    .select({ open: sql<number>`count(*) filter (where ${peopleTask.doneAt} is null)`, total: sql<number>`count(*)` })
    .from(peopleTask)
    .where(eq(peopleTask.changeId, changeId));
  const done = Number(total) > 0 && Number(open) === 0;
  if (done && c.status !== "done") await db.update(peopleChange).set({ status: "done", doneAt: new Date() }).where(eq(peopleChange.id, changeId));
  if (!done && c.status === "done") await db.update(peopleChange).set({ status: "open", doneAt: null }).where(eq(peopleChange.id, changeId));
}

/**
 * Ticks or unticks a task. Kit tasks move the item in the inventory too:
 * handing out checks it out to the starter, collecting checks it back in at their site.
 * Unticking undoes that, so the inventory always matches the checklist.
 */
export async function setTaskDone(actor: Actor, taskId: number, done: boolean) {
  requireIT(actor);
  const t = await db.query.peopleTask.findFirst({ where: eq(peopleTask.id, taskId) });
  if (!t) throw new PeopleError("Task not found.");
  if (!!t.doneAt === done) return;
  const c = await db.query.peopleChange.findFirst({ where: eq(peopleChange.id, t.changeId) });
  if (!c) throw new PeopleError("Not found.");
  if (c.status === "cancelled") throw new PeopleError("This has been cancelled. Reopen it first.");

  if (t.assetId && (t.kind === "kit_out" || t.kind === "kit_back")) {
    // A starter may have signed up since this was created.
    const userId = c.userId ?? (await accountFor(c.email));
    if (userId && !c.userId) await db.update(peopleChange).set({ userId }).where(eq(peopleChange.id, c.id));
    const handOut = (t.kind === "kit_out") === done;
    const why = `${KIND_LABEL[c.kind as ChangeKind]}: ${c.name}`;
    if (handOut) await checkOut(actor, t.assetId, { userId, name: c.name }, why);
    else await checkIn(actor, t.assetId, { siteId: c.siteId, location: "" }, why);
  }
  await db
    .update(peopleTask)
    .set(done ? { doneAt: new Date(), doneById: actor.id } : { doneAt: null, doneById: null })
    .where(eq(peopleTask.id, taskId));
  await refreshDone(c.id);
}

export async function addTask(actor: Actor, changeId: number, title: string) {
  requireIT(actor);
  const t = title.trim();
  if (!t) throw new PeopleError("Type the task first.");
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${peopleTask.sort}) filter (where ${peopleTask.kind} = 'task'), 0)` }).from(peopleTask).where(eq(peopleTask.changeId, changeId));
  await db.insert(peopleTask).values({ changeId, title: t.slice(0, 200), sort: Number(max) + 1 });
  await refreshDone(changeId);
}

export async function addKitTask(actor: Actor, changeId: number, assetId: number) {
  requireIT(actor);
  const c = await db.query.peopleChange.findFirst({ where: eq(peopleChange.id, changeId) });
  const a = await db.query.asset.findFirst({ where: eq(asset.id, assetId), columns: { id: true, tag: true, name: true } });
  if (!c || !a) throw new PeopleError("Not found.");
  const kind = c.kind === "starter" ? "kit_out" : "kit_back";
  const exists = await db.query.peopleTask.findFirst({ where: and(eq(peopleTask.changeId, changeId), eq(peopleTask.assetId, assetId)) });
  if (exists) throw new PeopleError(`${a.tag} is already on the list.`);
  await db.insert(peopleTask).values({ changeId, title: kitTitle(kind, a), kind, assetId, sort: 1000 + assetId });
  await refreshDone(changeId);
}

export async function removeTask(actor: Actor, taskId: number) {
  requireIT(actor);
  const t = await db.query.peopleTask.findFirst({ where: eq(peopleTask.id, taskId) });
  if (!t) return;
  if (t.doneAt && t.kind !== "task") throw new PeopleError("Untick it first, so the kit goes back where it was.");
  await db.delete(peopleTask).where(eq(peopleTask.id, taskId));
  await refreshDone(t.changeId);
}

/* ---------- reading ---------- */

// Raw SQL so the outer "people_change"."id" can't be mistaken for the task's own id inside the subquery.
const progress = sql<number>`(select count(*) from people_task pt where pt.change_id = "people_change"."id" and pt.done_at is not null)`;
const taskCount = sql<number>`(select count(*) from people_task pt where pt.change_id = "people_change"."id")`;

export async function listChanges(view: "open" | "starters" | "leavers" | "done" = "open") {
  const where =
    view === "done"
      ? inArray(peopleChange.status, ["done", "cancelled"])
      : and(eq(peopleChange.status, "open"), view === "starters" ? eq(peopleChange.kind, "starter") : view === "leavers" ? eq(peopleChange.kind, "leaver") : undefined);
  const rows = await db
    .select({ c: peopleChange, siteName: site.name, done: progress, total: taskCount })
    .from(peopleChange)
    .leftJoin(site, eq(site.id, peopleChange.siteId))
    .where(where)
    .orderBy(view === "done" ? desc(peopleChange.date) : asc(peopleChange.date), asc(peopleChange.id));
  const today = ukToday();
  return rows.map((r) => ({ ...r.c, siteName: r.siteName, done: Number(r.done), total: Number(r.total), days: daysBetween(today, r.c.date) }));
}

export async function getChange(id: number) {
  const [row] = await db
    .select({ c: peopleChange, siteName: site.name, createdBy: user.name })
    .from(peopleChange)
    .leftJoin(site, eq(site.id, peopleChange.siteId))
    .leftJoin(user, eq(user.id, peopleChange.createdById))
    .where(eq(peopleChange.id, id));
  if (!row) return null;
  const tasks = await db
    .select({ t: peopleTask, assetTag: asset.tag, assetName: asset.name, assetStatus: asset.status, doneBy: user.name })
    .from(peopleTask)
    .leftJoin(asset, eq(asset.id, peopleTask.assetId))
    .leftJoin(user, eq(user.id, peopleTask.doneById))
    .where(eq(peopleTask.changeId, id))
    .orderBy(asc(peopleTask.sort), asc(peopleTask.id));
  const c = row.c;
  // For a leaver: anything else they still have that isn't on the list yet.
  const listed = new Set(tasks.map((t) => t.t.assetId).filter(Boolean));
  const alsoHolding = c.kind === "leaver" && c.status !== "cancelled" ? (await kitHeldBy({ userId: c.userId, name: c.name })).filter((a) => !listed.has(a.id)) : [];
  return {
    ...c,
    siteName: row.siteName,
    createdBy: row.createdBy,
    days: daysBetween(ukToday(), c.date),
    tasks: tasks.map((t) => ({ ...t.t, assetTag: t.assetTag, assetName: t.assetName, assetStatus: t.assetStatus, doneBy: t.doneBy })),
    alsoHolding,
  };
}

/** Spare kit that could go to a starter, newest type first. */
export async function spareKit() {
  return db
    .select({ id: asset.id, tag: asset.tag, name: asset.name, typeName: assetType.name, siteName: site.name })
    .from(asset)
    .leftJoin(assetType, eq(assetType.id, asset.typeId))
    .leftJoin(site, eq(site.id, asset.siteId))
    .where(and(eq(asset.status, "spare"), isNull(asset.assignedUserId)))
    .orderBy(asc(assetType.name), asc(asset.tag));
}

/** Starters and leavers in the next `days` days (and any overdue ones still open). */
export async function upcomingChanges(now = new Date(), days = 14) {
  const today = ukToday(now);
  const rows = await db
    .select({ c: peopleChange, done: progress, total: taskCount })
    .from(peopleChange)
    .where(and(eq(peopleChange.status, "open"), sql`${peopleChange.date} <= ${addDays(today, days)}`))
    .orderBy(asc(peopleChange.date));
  return rows.map((r) => ({ id: r.c.id, kind: r.c.kind as ChangeKind, name: r.c.name, date: r.c.date, days: daysBetween(today, r.c.date), done: Number(r.done), total: Number(r.total) }));
}
