import { describe, expect, it } from "vitest";
import { addCountedMinutes, countedMinutes, DEFAULT_HOURS, fromLocal, localParts, validHours, waitingPeriods, windowAtOrAfter, type WorkingHours } from "@/lib/calendar";

// All times below are UK wall-clock times, which is what people see.
const uk = (s: string) => {
  const [d, t] = s.split(" ");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  return fromLocal(y, mo, da, h, mi);
};
const show = (d: Date | null) => {
  if (!d) return null;
  const p = localParts(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${z(p.month)}-${z(p.day)} ${z(p.hour)}:${z(p.minute)}`;
};
const hours = DEFAULT_HOURS; // 05:00–21:00 every day
const weekdays: WorkingHours = { start: "08:00", end: "17:30", days: [1, 2, 3, 4, 5] };

describe("UK time conversion", () => {
  it("handles summer time and winter time", () => {
    expect(uk("2026-07-01 12:00").toISOString()).toBe("2026-07-01T11:00:00.000Z"); // BST
    expect(uk("2026-12-01 12:00").toISOString()).toBe("2026-12-01T12:00:00.000Z"); // GMT
  });
});

describe("working windows", () => {
  it("finds today's window, or tomorrow's after hours", () => {
    expect(show(windowAtOrAfter(uk("2026-10-28 10:00"), hours)!.end)).toBe("2026-10-28 21:00");
    expect(show(windowAtOrAfter(uk("2026-10-28 22:00"), hours)!.start)).toBe("2026-10-29 05:00");
    expect(show(windowAtOrAfter(uk("2026-10-28 04:00"), hours)!.start)).toBe("2026-10-28 05:00");
  });
  it("skips days that aren't working days", () => {
    // Friday 30 Oct 2026, after hours → Monday
    expect(show(windowAtOrAfter(uk("2026-10-30 18:00"), weekdays)!.start)).toBe("2026-11-02 08:00");
  });
  it("returns null when no days are set", () => {
    expect(windowAtOrAfter(uk("2026-10-28 10:00"), { ...hours, days: [] })).toBeNull();
  });
});

describe("addCountedMinutes", () => {
  it("counts straight through with no working hours (Critical and High)", () => {
    expect(show(addCountedMinutes(uk("2026-10-28 20:30"), 4 * 60, { hours: null, pauses: [] }))).toBe("2026-10-29 00:30");
  });
  it("carries over to the next morning at 5am", () => {
    // 30 minutes left of the evening, then 3h30m from 05:00
    expect(show(addCountedMinutes(uk("2026-10-28 20:30"), 4 * 60, { hours, pauses: [] }))).toBe("2026-10-29 08:30");
  });
  it("starts counting at 5am for jobs raised overnight", () => {
    expect(show(addCountedMinutes(uk("2026-10-28 02:00"), 60, { hours, pauses: [] }))).toBe("2026-10-28 06:00");
  });
  it("spans several days: 3 days of working time is 72 hours across 16-hour days", () => {
    // 72h / 16h a day = 4.5 days. From 05:00 Mon: Mon, Tue, Wed, Thu full, then 8h Fri → 13:00 Fri
    expect(show(addCountedMinutes(uk("2026-10-26 05:00"), 72 * 60, { hours, pauses: [] }))).toBe("2026-10-30 13:00");
  });
  it("handles the clocks going back (25 Oct 2026) and forward (29 Mar 2026)", () => {
    expect(show(addCountedMinutes(uk("2026-10-24 20:00"), 120, { hours, pauses: [] }))).toBe("2026-10-25 06:00");
    expect(show(addCountedMinutes(uk("2026-03-28 20:00"), 120, { hours, pauses: [] }))).toBe("2026-03-29 06:00");
  });
  it("skips weekends with weekday hours", () => {
    expect(show(addCountedMinutes(uk("2026-10-30 16:30"), 120, { hours: weekdays, pauses: [] }))).toBe("2026-11-02 09:00");
  });
  it("adds paused time on top", () => {
    const pauses = [{ start: uk("2026-10-28 10:00"), end: uk("2026-10-28 12:00") }];
    expect(show(addCountedMinutes(uk("2026-10-28 09:00"), 120, { hours: null, pauses }))).toBe("2026-10-28 13:00");
  });
  it("combines pauses and working hours", () => {
    // Waiting from 19:00 until the requester replied at 07:00 next day.
    const pauses = [{ start: uk("2026-10-28 19:00"), end: uk("2026-10-29 07:00") }];
    // From 18:00: 1h counted until 19:00, paused, resumes 07:00, 2h more → 09:00
    expect(show(addCountedMinutes(uk("2026-10-28 18:00"), 180, { hours, pauses }))).toBe("2026-10-29 09:00");
  });
  it("can't set a deadline while paused with no end", () => {
    const pauses = [{ start: uk("2026-10-28 10:00"), end: null }];
    expect(addCountedMinutes(uk("2026-10-28 09:00"), 120, { hours: null, pauses })).toBeNull();
    // …unless the time runs out before the pause starts
    expect(show(addCountedMinutes(uk("2026-10-28 09:00"), 30, { hours: null, pauses }))).toBe("2026-10-28 09:30");
  });
});

describe("countedMinutes", () => {
  it("only counts working time and time outside pauses", () => {
    expect(countedMinutes(uk("2026-10-28 20:00"), uk("2026-10-29 06:00"), { hours, pauses: [] })).toBe(120);
    expect(countedMinutes(uk("2026-10-28 20:00"), uk("2026-10-29 06:00"), { hours: null, pauses: [] })).toBe(600);
    const pauses = [{ start: uk("2026-10-28 10:00"), end: null }];
    expect(countedMinutes(uk("2026-10-28 09:00"), uk("2026-10-28 15:00"), { hours: null, pauses })).toBe(60);
  });
  it("agrees with addCountedMinutes", () => {
    const from = uk("2026-10-28 19:42");
    const rules = { hours, pauses: [{ start: uk("2026-10-29 06:10"), end: uk("2026-10-29 09:55") }] };
    const due = addCountedMinutes(from, 500, rules)!;
    expect(countedMinutes(from, due, rules)).toBeCloseTo(500);
  });
});

describe("waitingPeriods", () => {
  it("pairs up time spent waiting", () => {
    const e = [
      { at: uk("2026-10-28 09:00"), from: "new", to: "progress" },
      { at: uk("2026-10-28 10:00"), from: "progress", to: "waiting" },
      { at: uk("2026-10-28 12:00"), from: "waiting", to: "progress" },
      { at: uk("2026-10-28 14:00"), from: "progress", to: "waiting" },
    ];
    const w = waitingPeriods(e);
    expect(w.map((p) => [show(p.start), show(p.end)])).toEqual([
      ["2026-10-28 10:00", "2026-10-28 12:00"],
      ["2026-10-28 14:00", null],
    ]);
  });
});

describe("validHours", () => {
  it("accepts sensible hours and rejects the rest", () => {
    expect(validHours(hours)).toBe(true);
    expect(validHours({ ...hours, end: "04:00" })).toBe(false);
    expect(validHours({ ...hours, start: "5am" })).toBe(false);
    expect(validHours({ ...hours, days: [7] })).toBe(false);
  });
});
