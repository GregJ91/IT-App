import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { fromLocal, localParts } from "@/lib/calendar";
import { ticketClocks } from "@/lib/sla";
import { DEFAULT_SETTINGS, recomputeDue, recomputeOpenTickets, saveSlaSettings } from "@/lib/sla-rules";
import { addMessage, createTicket, updateTicket } from "@/lib/tickets";
import { makeUser, resetData } from "./db-helpers";

vi.spyOn(console, "log").mockImplementation(() => {});

const uk = (y: number, mo: number, d: number, h: number, mi = 0) => fromLocal(y, mo, d, h, mi);
const show = (d: Date) => {
  const p = localParts(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${z(p.month)}-${z(p.day)} ${z(p.hour)}:${z(p.minute)}`;
};

let base: Awaited<ReturnType<typeof resetData>>;
beforeEach(async () => {
  base = await resetData();
  await db.update(schema.slaPolicy).set({ counts: "hours" }).where(eq(schema.slaPolicy.priority, 3));
  await saveSlaSettings(DEFAULT_SETTINGS); // 05:00–21:00 every day, pause while waiting
});

async function ticketAt(priority: number, createdAt: Date) {
  const kirsty = await makeUser(`Kirsty ${Math.random()}`, "staff");
  const t = await createTicket(kirsty, { title: "Test", description: "x", priority, categoryId: null, siteId: base.sites[0].id, location: "", contactPhone: "" }, []);
  await db.update(schema.ticket).set({ createdAt }).where(eq(schema.ticket.id, t.id));
  return (await recomputeDue(t.id))!;
}

async function statusAt(ticketId: number, at: Date, from: string, to: string) {
  await db.update(schema.ticket).set({ status: to }).where(eq(schema.ticket.id, ticketId));
  await db.insert(schema.ticketEvent).values({ ticketId, type: "status", data: { from, to }, createdAt: at });
}

describe("deadlines", () => {
  it("a Normal job logged at 8:30pm carries over to the next morning", async () => {
    const t = await ticketAt(3, uk(2026, 10, 28, 20, 30));
    expect(show(t.responseDueAt)).toBe("2026-10-29 08:30"); // 4h: 30m tonight, 3h30m from 5am
  });

  it("a Critical job counts through the night", async () => {
    const t = await ticketAt(1, uk(2026, 10, 28, 20, 30));
    expect(show(t.responseDueAt)).toBe("2026-10-28 20:45");
    expect(show(t.resolveDueAt)).toBe("2026-10-29 00:30");
  });

  it("time spent waiting on the requester doesn't count", async () => {
    const start = uk(2026, 10, 28, 9, 0);
    const t = await ticketAt(1, start);
    await statusAt(t.id, uk(2026, 10, 28, 10, 0), "new", "waiting");
    let row = (await recomputeDue(t.id, uk(2026, 10, 28, 11, 0)))!;
    expect(row.slaPausedAt).toEqual(uk(2026, 10, 28, 10, 0));
    expect(ticketClocks(row, uk(2026, 10, 28, 11, 0)).resolve.state).toBe("paused");

    await statusAt(t.id, uk(2026, 10, 28, 12, 0), "waiting", "progress");
    row = (await recomputeDue(t.id))!;
    expect(row.slaPausedAt).toBeNull();
    expect(show(row.resolveDueAt)).toBe("2026-10-28 15:00"); // 4h + 2h waiting
    // The first-response clock is never paused.
    expect(show(row.responseDueAt)).toBe("2026-10-28 09:15");
  });

  it("can be told not to pause", async () => {
    await saveSlaSettings({ ...DEFAULT_SETTINGS, pauseWhileWaiting: false });
    const t = await ticketAt(1, uk(2026, 10, 28, 9, 0));
    await statusAt(t.id, uk(2026, 10, 28, 10, 0), "new", "waiting");
    await statusAt(t.id, uk(2026, 10, 28, 12, 0), "waiting", "progress");
    const row = (await recomputeDue(t.id))!;
    expect(show(row.resolveDueAt)).toBe("2026-10-28 13:00");
  });

  it("recalculates open jobs when the hours change", async () => {
    const t = await ticketAt(3, uk(2026, 10, 28, 20, 30));
    await saveSlaSettings({ hours: { start: "08:00", end: "17:30", days: [1, 2, 3, 4, 5] }, pauseWhileWaiting: true });
    await recomputeOpenTickets();
    const row = await db.query.ticket.findFirst({ where: eq(schema.ticket.id, t.id) });
    expect(show(row!.responseDueAt)).toBe("2026-10-29 12:00"); // Thursday 8am + 4h
  });
});

describe("through the ticket actions", () => {
  it("pauses when IT asks a question and restarts when the requester replies", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const greg = await makeUser("Greg J", "tech");
    const t = await createTicket(kirsty, { title: "Wi-Fi", description: "x", priority: 2, categoryId: null, siteId: null, location: "", contactPhone: "" }, []);
    const before = t.resolveDueAt;

    const waiting = await updateTicket(t.id, greg, { status: "waiting" });
    expect(waiting.slaPausedAt).not.toBeNull();

    await new Promise((r) => setTimeout(r, 1100)); // let a little paused time pass
    await addMessage(t.id, kirsty, "It dropped at 10:15", false, []);
    const row = await db.query.ticket.findFirst({ where: eq(schema.ticket.id, t.id) });
    expect(row!.status).toBe("progress");
    expect(row!.slaPausedAt).toBeNull();
    expect(row!.resolveDueAt.getTime()).toBeGreaterThan(before.getTime());
  });
});
