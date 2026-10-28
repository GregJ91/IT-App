import { describe, expect, it } from "vitest";
import { byAttention, clock, clockLabel, dueDates, formatDuration, formatMinutes, headlineClock } from "@/lib/sla";

const t0 = new Date("2026-10-28T09:00:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60000);

describe("dueDates", () => {
  it("adds the policy minutes to the creation time", () => {
    const d = dueDates(t0, { responseMinutes: 15, resolveMinutes: 240 });
    expect(d.responseDueAt).toEqual(at(15));
    expect(d.resolveDueAt).toEqual(at(240));
  });
});

describe("clock", () => {
  it("is ok early, soon in the last quarter, late once past due", () => {
    expect(clock(t0, at(100), null, at(10)).state).toBe("ok");
    expect(clock(t0, at(100), null, at(80)).state).toBe("soon");
    expect(clock(t0, at(100), null, at(101)).state).toBe("late");
  });
  it("stops when done and records met or missed", () => {
    expect(clock(t0, at(100), at(50), at(500)).state).toBe("met");
    expect(clock(t0, at(100), at(150), at(500)).state).toBe("missed");
    expect(clock(t0, at(100), at(50)).remainingMs).toBeNull();
  });
  it("reports how much of the window is used, capped at 1", () => {
    expect(clock(t0, at(100), null, at(25)).used).toBeCloseTo(0.25);
    expect(clock(t0, at(100), null, at(300)).used).toBe(1);
  });
});

describe("labels", () => {
  it("formats durations the way the design shows them", () => {
    expect(formatDuration(25 * 60000)).toBe("25m");
    expect(formatDuration(70 * 60000)).toBe("1h 10m");
    expect(formatDuration((2 * 24 * 60 + 4 * 60) * 60000)).toBe("2d 4h");
    expect(formatDuration(-25 * 60000)).toBe("25m");
  });
  it("labels clocks", () => {
    expect(clockLabel(clock(t0, at(100), null, at(30)))).toBe("1h 10m left");
    expect(clockLabel(clock(t0, at(100), null, at(125)))).toBe("Overdue 25m");
    expect(clockLabel(clock(t0, at(100), at(10)))).toBe("SLA met");
  });
  it("formats settings minutes", () => {
    expect(formatMinutes(15)).toBe("15 min");
    expect(formatMinutes(60)).toBe("1 hour");
    expect(formatMinutes(240)).toBe("4 hours");
    expect(formatMinutes(1440)).toBe("1 day");
    expect(formatMinutes(4320)).toBe("3 days");
  });
});

describe("headlineClock", () => {
  const base = { createdAt: t0, responseDueAt: at(15), resolveDueAt: at(240), firstResponseAt: null, resolvedAt: null };
  it("shows the response clock until IT has responded", () => {
    expect(headlineClock(base, at(5)).dueAt).toEqual(at(15));
  });
  it("then the resolve clock", () => {
    expect(headlineClock({ ...base, firstResponseAt: at(10) }, at(20)).dueAt).toEqual(at(240));
  });
  it("always shows an overdue resolve clock", () => {
    expect(headlineClock(base, at(300)).dueAt).toEqual(at(240));
  });
});

describe("byAttention", () => {
  const now = at(1000);
  // Each job: priority and how many minutes until (negative = since) its deadline.
  const job = (id: string, priority: number, dueIn: number, responded = true) => ({
    id,
    priority,
    createdAt: at(0),
    responseDueAt: at(1000 + dueIn),
    resolveDueAt: at(1000 + dueIn),
    firstResponseAt: responded ? at(10) : null,
    resolvedAt: null,
  });

  it("puts overdue Critical and High jobs first, then other overdue jobs, then the rest by deadline", () => {
    const list = [
      job("monitor-P3-overdue-16h", 3, -960),
      job("wifi-P2-overdue-2h", 2, -120),
      job("labels-P1-overdue-25m", 1, -25),
      job("sage-P2-due-10m", 2, 10),
      job("teams-P3-due-3h", 3, 228),
      job("toner-P4-overdue-5m", 4, -5),
      job("starter-P3-due-1d", 3, 1440),
    ];
    expect(byAttention(list, now).map((j) => j.id)).toEqual([
      "labels-P1-overdue-25m",
      "wifi-P2-overdue-2h",
      "monitor-P3-overdue-16h",
      "toner-P4-overdue-5m",
      "sage-P2-due-10m",
      "teams-P3-due-3h",
      "starter-P3-due-1d",
    ]);
  });

  it("puts the most overdue first within the same priority", () => {
    const list = [job("a", 1, -5), job("b", 1, -60)];
    expect(byAttention(list, now).map((j) => j.id)).toEqual(["b", "a"]);
  });

  it("uses the response deadline for jobs nobody has answered yet", () => {
    const unanswered = { ...job("unanswered", 2, 500, false), responseDueAt: at(990) };
    expect(byAttention([job("other", 2, 100), unanswered], now)[0].id).toBe("unanswered");
  });
});
