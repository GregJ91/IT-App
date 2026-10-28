import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { pickAssignee } from "./assignment";
import { isITRole, type Actor } from "./roles";
import { byAttention, dueDates } from "./sla";
import * as alerts from "./ticket-alerts";
import { saveUpload } from "./storage";
import { OPEN_STATUSES, type Status } from "./tickets-shared";

const { ticket, ticketMessage, attachment, ticketEvent, timeEntry, user, site, category, slaPolicy, assignmentRule } =
  schema;

export class TicketError extends Error {}

/* ---------- lookups ---------- */

export async function getLookups() {
  const [sites, categories, policies, itUsers] = await Promise.all([
    db.select().from(site).where(eq(site.archived, false)).orderBy(asc(site.position), asc(site.name)),
    db.select().from(category).where(eq(category.archived, false)).orderBy(asc(category.position), asc(category.name)),
    db.select().from(slaPolicy).orderBy(asc(slaPolicy.priority)),
    db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role })
      .from(user)
      .where(inArray(user.role, ["tech", "admin"]))
      .orderBy(asc(user.name)),
  ]);
  return { sites, categories, policies, itUsers };
}

async function policyFor(priority: number) {
  const p = await db.query.slaPolicy.findFirst({ where: eq(slaPolicy.priority, priority) });
  if (!p) throw new TicketError(`No SLA set for priority ${priority}.`);
  return p;
}

/** Assignee chosen by the rules, ignoring anyone who is no longer in the IT team. */
async function autoAssignee(t: { categoryId: number | null; siteId: number | null }) {
  const rules = await db.select().from(assignmentRule);
  const id = pickAssignee(rules, t);
  if (!id) return null;
  const u = await db.query.user.findFirst({ where: eq(user.id, id), columns: { role: true } });
  return u && isITRole(u.role) ? id : null;
}

async function saveFiles(files: File[], ticketId: number, messageId: number | null, uploadedById: string) {
  for (const f of files) {
    const key = await saveUpload(f);
    await db.insert(attachment).values({
      ticketId,
      messageId,
      uploadedById,
      filename: f.name.slice(0, 200) || "image",
      mimeType: f.type,
      size: f.size,
      storageKey: key,
    });
  }
}

/* ---------- create ---------- */

export type NewTicket = {
  title: string;
  description: string;
  priority: number;
  categoryId: number | null;
  siteId: number | null;
  location: string;
  contactPhone: string;
};

export async function createTicket(requester: Actor, input: NewTicket, files: File[]) {
  const policy = await policyFor(input.priority);
  const createdAt = new Date();
  const assigneeId = await autoAssignee(input);
  const [row] = await db
    .insert(ticket)
    .values({ ...input, requesterId: requester.id, assigneeId, createdAt, updatedAt: createdAt, ...dueDates(createdAt, policy) })
    .returning();
  await db.insert(ticketEvent).values({
    ticketId: row.id,
    actorId: requester.id,
    type: "created",
    data: assigneeId ? { assigneeId, byRule: true } : {},
  });
  await saveFiles(files, row.id, null, requester.id);
  // Remember the number for next time.
  if (input.contactPhone && input.contactPhone !== requester.phone) {
    await db.update(user).set({ phone: input.contactPhone }).where(eq(user.id, requester.id));
  }

  await alerts.ticketCreated(row, requester, files.length);
  return row;
}

/* ---------- lists ---------- */

export type TicketView = "open" | "mine" | "unassigned" | "all" | "done";

const requester = alias(user, "requester");
const assignee = alias(user, "assignee");

const listColumns = {
  id: ticket.id,
  title: ticket.title,
  status: ticket.status,
  priority: ticket.priority,
  location: ticket.location,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
  responseDueAt: ticket.responseDueAt,
  resolveDueAt: ticket.resolveDueAt,
  firstResponseAt: ticket.firstResponseAt,
  resolvedAt: ticket.resolvedAt,
  assigneeId: ticket.assigneeId,
  requesterName: requester.name,
  assigneeName: assignee.name,
  siteName: site.name,
  categoryName: category.name,
  attachments: sql<number>`(select count(*)::int from ${attachment} where ${attachment.ticketId} = ${ticket.id} and ${attachment.messageId} is null)`,
};

export type TicketListItem = Awaited<ReturnType<typeof listTickets>>[number];

export async function listTickets(opts: {
  view: TicketView;
  userId: string;
  siteId?: number | null;
  priority?: number | null;
  q?: string;
  limit?: number;
}) {
  const where: SQL[] = [];
  const open = inArray(ticket.status, OPEN_STATUSES);
  if (opts.view === "open") where.push(open);
  if (opts.view === "mine") where.push(open, eq(ticket.assigneeId, opts.userId));
  if (opts.view === "unassigned") where.push(open, isNull(ticket.assigneeId));
  if (opts.view === "done") where.push(inArray(ticket.status, ["resolved", "closed"]));
  if (opts.siteId) where.push(eq(ticket.siteId, opts.siteId));
  if (opts.priority) where.push(eq(ticket.priority, opts.priority));
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    const asNumber = Number(opts.q.replace(/^it-/i, ""));
    where.push(
      or(
        ilike(ticket.title, q),
        ilike(ticket.description, q),
        ilike(ticket.location, q),
        ilike(requester.name, q),
        ...(Number.isInteger(asNumber) && asNumber > 0 ? [eq(ticket.id, asNumber)] : []),
      )!,
    );
  }
  // Open work sorts by what's due first; finished work by most recent.
  const order =
    opts.view === "done" || opts.view === "all"
      ? [desc(ticket.updatedAt)]
      : [asc(ticket.priority), asc(ticket.resolveDueAt)];
  return db
    .select(listColumns)
    .from(ticket)
    .innerJoin(requester, eq(requester.id, ticket.requesterId))
    .leftJoin(assignee, eq(assignee.id, ticket.assigneeId))
    .leftJoin(site, eq(site.id, ticket.siteId))
    .leftJoin(category, eq(category.id, ticket.categoryId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(...order)
    .limit(opts.limit ?? 200);
}

export async function listMyTickets(userId: string) {
  return db
    .select(listColumns)
    .from(ticket)
    .innerJoin(requester, eq(requester.id, ticket.requesterId))
    .leftJoin(assignee, eq(assignee.id, ticket.assigneeId))
    .leftJoin(site, eq(site.id, ticket.siteId))
    .leftJoin(category, eq(category.id, ticket.categoryId))
    .where(eq(ticket.requesterId, userId))
    .orderBy(sql`case when ${ticket.status} in ('resolved','closed') then 1 else 0 end`, desc(ticket.updatedAt))
    .limit(100);
}

export async function countOpenTickets() {
  const [r] = await db.select({ n: count() }).from(ticket).where(inArray(ticket.status, OPEN_STATUSES));
  return r.n;
}

/* ---------- detail ---------- */

export function canView(viewer: Pick<Actor, "id" | "role">, t: { requesterId: string }) {
  return isITRole(viewer.role) || t.requesterId === viewer.id;
}

export async function getTicketForViewer(id: number, viewer: Actor) {
  const t = await db.query.ticket.findFirst({ where: eq(ticket.id, id) });
  if (!t || !canView(viewer, t)) return null;
  const it = isITRole(viewer.role);

  const [people, siteRow, categoryRow, messages, files, events, time] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role })
      .from(user)
      .where(inArray(user.id, [t.requesterId, t.assigneeId].filter(Boolean) as string[])),
    t.siteId ? db.query.site.findFirst({ where: eq(site.id, t.siteId) }) : null,
    t.categoryId ? db.query.category.findFirst({ where: eq(category.id, t.categoryId) }) : null,
    db
      .select({
        id: ticketMessage.id,
        body: ticketMessage.body,
        internal: ticketMessage.internal,
        createdAt: ticketMessage.createdAt,
        authorId: ticketMessage.authorId,
        authorName: user.name,
        authorRole: user.role,
      })
      .from(ticketMessage)
      .leftJoin(user, eq(user.id, ticketMessage.authorId))
      .where(and(eq(ticketMessage.ticketId, id), it ? undefined : eq(ticketMessage.internal, false)))
      .orderBy(asc(ticketMessage.createdAt)),
    db
      .select({
        id: attachment.id,
        filename: attachment.filename,
        messageId: attachment.messageId,
        mimeType: attachment.mimeType,
        size: attachment.size,
      })
      .from(attachment)
      .leftJoin(ticketMessage, eq(ticketMessage.id, attachment.messageId))
      .where(
        and(
          eq(attachment.ticketId, id),
          it ? undefined : or(isNull(attachment.messageId), eq(ticketMessage.internal, false)),
        ),
      )
      .orderBy(asc(attachment.id)),
    db
      .select({ id: ticketEvent.id, type: ticketEvent.type, data: ticketEvent.data, createdAt: ticketEvent.createdAt, actorName: user.name })
      .from(ticketEvent)
      .leftJoin(user, eq(user.id, ticketEvent.actorId))
      .where(eq(ticketEvent.ticketId, id))
      .orderBy(asc(ticketEvent.createdAt)),
    it
      ? db
          .select({ id: timeEntry.id, minutes: timeEntry.minutes, note: timeEntry.note, createdAt: timeEntry.createdAt, userName: user.name })
          .from(timeEntry)
          .leftJoin(user, eq(user.id, timeEntry.userId))
          .where(eq(timeEntry.ticketId, id))
          .orderBy(asc(timeEntry.createdAt))
      : [],
  ]);

  const byId = new Map(people.map((p) => [p.id, p]));
  return {
    ticket: t,
    requester: byId.get(t.requesterId)!,
    assignee: t.assigneeId ? (byId.get(t.assigneeId) ?? null) : null,
    site: siteRow ?? null,
    category: categoryRow ?? null,
    messages,
    files,
    events,
    time,
    minutesLogged: time.reduce((n, e) => n + e.minutes, 0),
  };
}

export type TicketDetail = NonNullable<Awaited<ReturnType<typeof getTicketForViewer>>>;

export async function getAttachmentForViewer(id: number, viewer: Actor) {
  const row = await db
    .select({ a: attachment, requesterId: ticket.requesterId, internal: ticketMessage.internal })
    .from(attachment)
    .innerJoin(ticket, eq(ticket.id, attachment.ticketId))
    .leftJoin(ticketMessage, eq(ticketMessage.id, attachment.messageId))
    .where(eq(attachment.id, id))
    .limit(1);
  const r = row[0];
  if (!r || !canView(viewer, r)) return null;
  if (r.internal && !isITRole(viewer.role)) return null;
  return r.a;
}

/* ---------- changes ---------- */

export type TicketPatch = {
  status?: Status;
  assigneeId?: string | null;
  priority?: number;
  categoryId?: number | null;
  siteId?: number | null;
};

export async function updateTicket(id: number, actor: Actor, patch: TicketPatch) {
  if (!isITRole(actor.role)) throw new TicketError("Only the IT team can change a ticket.");
  const t = await db.query.ticket.findFirst({ where: eq(ticket.id, id) });
  if (!t) throw new TicketError("Ticket not found.");

  const now = new Date();
  const set: Partial<typeof ticket.$inferInsert> = { updatedAt: now };
  const events: { type: string; data: Record<string, unknown> }[] = [];

  if (patch.status && patch.status !== t.status) {
    set.status = patch.status;
    events.push({ type: "status", data: { from: t.status, to: patch.status } });
    if (!t.firstResponseAt && patch.status !== "new") set.firstResponseAt = now;
    if (patch.status === "resolved") set.resolvedAt = t.resolvedAt ?? now;
    if (patch.status === "closed") {
      set.closedAt = now;
      set.resolvedAt = t.resolvedAt ?? now;
    }
    if (OPEN_STATUSES.includes(patch.status)) {
      set.resolvedAt = null;
      set.closedAt = null;
    }
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== t.assigneeId) {
    if (patch.assigneeId) {
      const u = await db.query.user.findFirst({ where: eq(user.id, patch.assigneeId), columns: { role: true } });
      if (!u || !isITRole(u.role)) throw new TicketError("Tickets can only be assigned to the IT team.");
    }
    set.assigneeId = patch.assigneeId;
    events.push({ type: "assigned", data: { from: t.assigneeId, to: patch.assigneeId } });
  }
  if (patch.priority && patch.priority !== t.priority) {
    const policy = await policyFor(patch.priority);
    set.priority = patch.priority;
    Object.assign(set, dueDates(t.createdAt, policy));
    events.push({ type: "priority", data: { from: t.priority, to: patch.priority } });
  }
  if (patch.categoryId !== undefined && patch.categoryId !== t.categoryId) {
    set.categoryId = patch.categoryId;
    events.push({ type: "category", data: { from: t.categoryId, to: patch.categoryId } });
  }
  if (patch.siteId !== undefined && patch.siteId !== t.siteId) {
    set.siteId = patch.siteId;
    events.push({ type: "site", data: { from: t.siteId, to: patch.siteId } });
  }
  if (events.length === 0) return t;

  const [row] = await db.update(ticket).set(set).where(eq(ticket.id, id)).returning();
  await db.insert(ticketEvent).values(events.map((e) => ({ ticketId: id, actorId: actor.id, ...e })));

  await alerts.ticketChanged(t, row, actor);
  return row;
}

export async function addMessage(id: number, actor: Actor, body: string, internal: boolean, files: File[]) {
  const t = await db.query.ticket.findFirst({ where: eq(ticket.id, id) });
  if (!t || !canView(actor, t)) throw new TicketError("Ticket not found.");
  const it = isITRole(actor.role);
  if (!it) internal = false;
  if (!body.trim() && files.length === 0) throw new TicketError("Write a message or add a screenshot.");

  const now = new Date();
  const [msg] = await db
    .insert(ticketMessage)
    .values({ ticketId: id, authorId: actor.id, body: body.trim(), internal, createdAt: now })
    .returning();
  await saveFiles(files, id, msg.id, actor.id);

  const set: Partial<typeof ticket.$inferInsert> = { updatedAt: now };
  if (it && !internal && !t.firstResponseAt) set.firstResponseAt = now;
  // A reply from the person who raised it puts the job back in IT's court.
  if (!it && (t.status === "waiting" || t.status === "resolved")) {
    set.status = "progress";
    set.resolvedAt = null;
    await db.insert(ticketEvent).values({ ticketId: id, actorId: actor.id, type: "status", data: { from: t.status, to: "progress", reopened: t.status === "resolved" } });
  }
  await db.update(ticket).set(set).where(eq(ticket.id, id));

  await alerts.messageAdded(t, actor, body, internal, it);
  return msg;
}

export async function logTime(id: number, actor: Actor, minutes: number, note: string) {
  if (!isITRole(actor.role)) throw new TicketError("Only the IT team can log time.");
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60) throw new TicketError("Enter between 1 minute and 24 hours.");
  await db.insert(timeEntry).values({ ticketId: id, userId: actor.id, minutes, note: note.trim() });
}

export async function rateTicket(id: number, actor: Actor, rating: number, comment: string) {
  const t = await db.query.ticket.findFirst({ where: eq(ticket.id, id) });
  if (!t || t.requesterId !== actor.id) throw new TicketError("Ticket not found.");
  if (!["resolved", "closed"].includes(t.status)) throw new TicketError("You can rate a job once it's resolved.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new TicketError("Pick 1 to 5 stars.");
  await db.update(ticket).set({ satisfaction: rating, satisfactionComment: comment.trim() || null }).where(eq(ticket.id, id));
  await db.insert(ticketEvent).values({ ticketId: id, actorId: actor.id, type: "rated", data: { rating } });
  await alerts.ticketRated(t, actor, rating, comment);
}

/* ---------- dashboard ---------- */

export async function dashboard(userId: string, now = new Date()) {
  const open = await listTickets({ view: "open", userId, limit: 500 });
  const breaching = open.filter(
    (t) => t.resolveDueAt < now || (!t.firstResponseAt && t.responseDueAt < now),
  );
  const unassigned = open.filter((t) => !t.assigneeId);
  const mine = open.filter((t) => t.assigneeId === userId);

  // Jobs raised per day for the last 14 days (server time zone).
  const days = await db.execute<{ day: string; n: number }>(sql`
    select to_char(d::date, 'YYYY-MM-DD') as day, count(${ticket.id})::int as n
    from generate_series(current_date - interval '13 days', current_date, interval '1 day') d
    left join ${ticket} on ${ticket.createdAt}::date = d::date
    group by d order by d`);

  const [rating] = await db
    .select({ avg: sql<number | null>`avg(${ticket.satisfaction})::float`, n: count(ticket.satisfaction) })
    .from(ticket)
    .where(ne(ticket.status, "new"));

  const attention = byAttention(open, now).slice(0, 6);

  return { open, breaching, unassigned, mine, attention, perDay: days.rows, rating };
}
