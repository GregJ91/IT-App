// Works out each ticket's SLA deadlines from its priority, the working hours,
// and any time it spent waiting on the requester.
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { addCountedMinutes, DEFAULT_HOURS, validHours, waitingPeriods, type WorkingHours } from "./calendar";
import { OPEN_STATUSES } from "./tickets-shared";

const { ticket, ticketEvent, slaPolicy, appSetting } = schema;

export type SlaSettings = { hours: WorkingHours; pauseWhileWaiting: boolean };

export const DEFAULT_SETTINGS: SlaSettings = { hours: DEFAULT_HOURS, pauseWhileWaiting: true };

export async function getSlaSettings(): Promise<SlaSettings> {
  const rows = await db.select().from(appSetting).where(inArray(appSetting.key, ["workingHours", "pauseWhileWaiting"]));
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const hours = byKey.get("workingHours") as WorkingHours | undefined;
  const pause = byKey.get("pauseWhileWaiting");
  return {
    hours: hours && validHours(hours) ? hours : DEFAULT_SETTINGS.hours,
    pauseWhileWaiting: typeof pause === "boolean" ? pause : DEFAULT_SETTINGS.pauseWhileWaiting,
  };
}

export async function saveSlaSettings(s: SlaSettings) {
  const now = new Date();
  for (const [key, value] of [
    ["workingHours", s.hours],
    ["pauseWhileWaiting", s.pauseWhileWaiting],
  ] as const) {
    await db
      .insert(appSetting)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: appSetting.key, set: { value, updatedAt: now } });
  }
}

/** Recalculates one ticket's deadlines and pause state, and saves them. */
export async function recomputeDue(ticketId: number, now = new Date()) {
  const t = await db.query.ticket.findFirst({ where: eq(ticket.id, ticketId) });
  if (!t) return null;
  const policy = await db.query.slaPolicy.findFirst({ where: eq(slaPolicy.priority, t.priority) });
  if (!policy) return t;
  const settings = await getSlaSettings();
  const hours = policy.counts === "hours" ? settings.hours : null;

  let pauses: { start: Date; end: Date | null }[] = [];
  if (settings.pauseWhileWaiting) {
    const events = await db
      .select({ at: ticketEvent.createdAt, data: ticketEvent.data })
      .from(ticketEvent)
      .where(and(eq(ticketEvent.ticketId, ticketId), eq(ticketEvent.type, "status")))
      .orderBy(asc(ticketEvent.createdAt), asc(ticketEvent.id));
    pauses = waitingPeriods(events.map((e) => ({ at: e.at, from: String(e.data.from), to: String(e.data.to) })));
  }
  const openPause = pauses.find((p) => p.end === null) ?? null;
  // While paused, show the deadline as if the job resumed now; it's recalculated when it does.
  const closedPauses = pauses.map((p) => ({ start: p.start, end: p.end ?? now }));

  const wall = (min: number) => new Date(t.createdAt.getTime() + min * 60_000);
  const responseDueAt = addCountedMinutes(t.createdAt, policy.responseMinutes, { hours, pauses: [] }) ?? wall(policy.responseMinutes);
  const resolveDueAt = addCountedMinutes(t.createdAt, policy.resolveMinutes, { hours, pauses: closedPauses }) ?? wall(policy.resolveMinutes);
  const slaPausedAt = openPause && !t.resolvedAt ? openPause.start : null;

  const [row] = await db.update(ticket).set({ responseDueAt, resolveDueAt, slaPausedAt }).where(eq(ticket.id, ticketId)).returning();
  return row;
}

/** After the SLA settings change, bring every open ticket in line. */
export async function recomputeOpenTickets() {
  const open = await db.select({ id: ticket.id }).from(ticket).where(inArray(ticket.status, OPEN_STATUSES));
  for (const { id } of open) await recomputeDue(id);
  return open.length;
}
