// Time maths for SLA clocks: working hours (in UK time) and pauses.
// Pure functions, no database, so they can be tested exactly.

export const TIME_ZONE = "Europe/London";

export type WorkingHours = {
  /** "05:00" */
  start: string;
  /** "21:00", later than start */
  end: string;
  /** Days the hours apply, 0 = Sunday … 6 = Saturday. */
  days: number[];
};

export type Interval = { start: Date; end: Date | null };

const MIN = 60_000;

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  weekday: "short",
  hourCycle: "h23",
});
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of an instant in UK time. */
export function localParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAY[p.weekday],
  };
}

/** The instant when UK clocks show this date and time. */
export function fromLocal(year: number, month: number, day: number, hour: number, minute: number) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess));
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += wanted - shown;
  }
  return new Date(guess);
}

const hm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return { h, m };
};

/** The working window that contains `at`, or the next one after it. Null if no days are set. */
export function windowAtOrAfter(at: Date, hours: WorkingHours): { start: Date; end: Date } | null {
  if (hours.days.length === 0) return null;
  const s = hm(hours.start);
  const e = hm(hours.end);
  const p = localParts(at);
  for (let i = 0; i < 8; i++) {
    // Step through calendar days in UK time.
    const day = new Date(Date.UTC(p.year, p.month - 1, p.day + i));
    const y = day.getUTCFullYear();
    const mo = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    if (!hours.days.includes(day.getUTCDay())) continue;
    const start = fromLocal(y, mo, d, s.h, s.m);
    const end = fromLocal(y, mo, d, e.h, e.m);
    if (end > at) return { start: start > at ? start : at, end };
  }
  return null;
}

/** Pauses that overlap or follow `at`, sorted, with open-ended ones treated as "until further notice". */
function upcoming(pauses: Interval[], at: Date) {
  return pauses
    .filter((p) => p.end === null || p.end > at)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export type ClockRules = { hours: WorkingHours | null; pauses: Interval[] };

/**
 * The instant when `minutes` of countable time have passed since `from`.
 * Countable time is inside working hours (when given) and outside pauses.
 * Returns null if the clock is paused with no end, so no deadline can be set yet.
 */
export function addCountedMinutes(from: Date, minutes: number, rules: ClockRules): Date | null {
  let cursor = from;
  let left = minutes * MIN;
  const pauses = upcoming(rules.pauses, from);
  for (let guard = 0; guard < 10_000; guard++) {
    const inPause = pauses.find((p) => p.start <= cursor && (p.end === null || p.end > cursor));
    if (inPause) {
      if (inPause.end === null) return null;
      cursor = inPause.end;
      continue;
    }
    let segEnd = Infinity;
    if (rules.hours) {
      const w = windowAtOrAfter(cursor, rules.hours);
      if (!w) return null;
      if (w.start > cursor) {
        cursor = w.start;
        continue;
      }
      segEnd = w.end.getTime();
    }
    const nextPause = pauses.find((p) => p.start > cursor);
    if (nextPause) segEnd = Math.min(segEnd, nextPause.start.getTime());
    const room = segEnd - cursor.getTime();
    if (left <= room) return new Date(cursor.getTime() + left);
    left -= room;
    cursor = new Date(segEnd);
  }
  return null;
}

/** Countable minutes between two instants. */
export function countedMinutes(from: Date, to: Date, rules: ClockRules) {
  if (to <= from) return 0;
  let total = 0;
  let cursor = from;
  const pauses = upcoming(rules.pauses, from);
  for (let guard = 0; guard < 10_000 && cursor < to; guard++) {
    const inPause = pauses.find((p) => p.start <= cursor && (p.end === null || p.end > cursor));
    if (inPause) {
      if (inPause.end === null) break;
      cursor = inPause.end;
      continue;
    }
    let segEnd = to.getTime();
    if (rules.hours) {
      const w = windowAtOrAfter(cursor, rules.hours);
      if (!w || w.start >= to) break;
      if (w.start > cursor) {
        cursor = w.start;
        continue;
      }
      segEnd = Math.min(segEnd, w.end.getTime());
    }
    const nextPause = pauses.find((p) => p.start > cursor);
    if (nextPause) segEnd = Math.min(segEnd, nextPause.start.getTime());
    total += segEnd - cursor.getTime();
    cursor = new Date(segEnd);
  }
  return total / MIN;
}

/**
 * Periods a ticket spent "Waiting on user", from its status history.
 * `events` are status changes in time order. An open period has end = null.
 */
export function waitingPeriods(events: { at: Date; from: string; to: string }[]): Interval[] {
  const out: Interval[] = [];
  let open: Date | null = null;
  for (const e of events) {
    if (e.to === "waiting" && open === null) open = e.at;
    else if (e.from === "waiting" && e.to !== "waiting" && open !== null) {
      out.push({ start: open, end: e.at });
      open = null;
    }
  }
  if (open) out.push({ start: open, end: null });
  return out;
}

export function validHours(h: WorkingHours) {
  const ok = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  return ok(h.start) && ok(h.end) && h.end > h.start && h.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

export const DEFAULT_HOURS: WorkingHours = { start: "05:00", end: "21:00", days: [0, 1, 2, 3, 4, 5, 6] };
