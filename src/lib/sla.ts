// SLA maths. Kept free of database code so it can be unit tested.

export type SlaPolicy = { priority: number; label: string; responseMinutes: number; resolveMinutes: number };

const MIN = 60 * 1000;

export function dueDates(createdAt: Date, policy: Pick<SlaPolicy, "responseMinutes" | "resolveMinutes">) {
  return {
    responseDueAt: new Date(createdAt.getTime() + policy.responseMinutes * MIN),
    resolveDueAt: new Date(createdAt.getTime() + policy.resolveMinutes * MIN),
  };
}

export type ClockState = "met" | "missed" | "ok" | "soon" | "late";

export type Clock = {
  state: ClockState;
  dueAt: Date;
  /** Positive while time is left, negative once overdue. Null once the clock has stopped. */
  remainingMs: number | null;
  /** Share of the allowed time used so far, 0–1 (capped). */
  used: number;
  doneAt: Date | null;
};

/** "soon" once less than this share of the window is left. */
export const SOON_SHARE = 0.25;

export function clock(startedAt: Date, dueAt: Date, doneAt: Date | null, now = new Date()): Clock {
  const window = Math.max(dueAt.getTime() - startedAt.getTime(), 1);
  if (doneAt) {
    const used = Math.min((doneAt.getTime() - startedAt.getTime()) / window, 1);
    return { state: doneAt <= dueAt ? "met" : "missed", dueAt, remainingMs: null, used, doneAt };
  }
  const remainingMs = dueAt.getTime() - now.getTime();
  const used = Math.min(Math.max((now.getTime() - startedAt.getTime()) / window, 0), 1);
  const state: ClockState = remainingMs < 0 ? "late" : remainingMs < window * SOON_SHARE ? "soon" : "ok";
  return { state, dueAt, remainingMs, used, doneAt: null };
}

export function ticketClocks(
  t: { createdAt: Date; responseDueAt: Date; resolveDueAt: Date; firstResponseAt: Date | null; resolvedAt: Date | null },
  now = new Date(),
) {
  return {
    response: clock(t.createdAt, t.responseDueAt, t.firstResponseAt, now),
    resolve: clock(t.createdAt, t.resolveDueAt, t.resolvedAt, now),
  };
}

/** The clock that matters most right now: response until answered, then resolve. */
export function headlineClock(t: Parameters<typeof ticketClocks>[0], now = new Date()) {
  const c = ticketClocks(t, now);
  if (c.resolve.state === "late") return c.resolve;
  return c.response.doneAt ? c.resolve : c.response;
}

/** 25m · 1h 10m · 2d 4h */
export function formatDuration(ms: number) {
  const totalMin = Math.max(Math.round(Math.abs(ms) / MIN), 0);
  const d = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin % (60 * 24)) / 60);
  const m = totalMin % 60;
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** Short text for lists, e.g. "1h 10m left", "Overdue 25m", "SLA met". */
export function clockLabel(c: Clock) {
  if (c.state === "met") return "SLA met";
  if (c.state === "missed") return "SLA missed";
  if (c.state === "late") return `Overdue ${formatDuration(c.remainingMs!)}`;
  return `${formatDuration(c.remainingMs!)} left`;
}

/** Minutes as the settings page shows them: 15 min, 4 hours, 3 days. */
export function formatMinutes(min: number) {
  if (min % (60 * 24) === 0) return `${min / (60 * 24)} day${min === 60 * 24 ? "" : "s"}`;
  if (min % 60 === 0) return `${min / 60} hour${min === 60 ? "" : "s"}`;
  return `${min} min`;
}

type Rankable = Parameters<typeof headlineClock>[0] & { priority: number };

/**
 * Order for the dashboard's "Needs attention" list:
 * 1. overdue Critical and High jobs (P1 before P2, then most overdue first)
 * 2. other overdue jobs (same order)
 * 3. everything else by deadline, soonest first.
 */
export function byAttention<T extends Rankable>(list: T[], now = new Date()) {
  const keyed = list.map((t) => {
    const c = headlineClock(t, now);
    const late = c.state === "late";
    const tier = late && t.priority <= 2 ? 0 : late ? 1 : 2;
    return { t, tier, due: c.dueAt.getTime() };
  });
  keyed.sort((a, b) => a.tier - b.tier || (a.tier < 2 ? a.t.priority - b.t.priority : 0) || a.due - b.due);
  return keyed.map((k) => k.t);
}
