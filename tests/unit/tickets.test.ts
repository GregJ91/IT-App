import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import {
  addMessage,
  canView,
  createTicket,
  getAttachmentForViewer,
  getTicketForViewer,
  listTickets,
  rateTicket,
  TicketError,
  updateTicket,
} from "@/lib/tickets";
import { makeUser, png, resetData } from "./db-helpers";

vi.spyOn(console, "log").mockImplementation(() => {}); // printed emails

let sites: Awaited<ReturnType<typeof resetData>>["sites"];
let cats: Awaited<ReturnType<typeof resetData>>["cats"];
beforeEach(async () => {
  ({ sites, cats } = await resetData());
});

const input = (over: Partial<Parameters<typeof createTicket>[1]> = {}) => ({
  title: "Label printer printing blank labels",
  description: "Since 8am",
  priority: 1,
  categoryId: cats[0].id,
  siteId: sites[1].id,
  location: "Dispatch bench 2",
  contactPhone: "07700 900412",
  ...over,
});

describe("creating tickets", () => {
  it("sets SLA deadlines from the priority and assigns by rule", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const greg = await makeUser("Greg J", "admin");
    await db.insert(schema.assignmentRule).values({ categoryId: cats[0].id, siteId: sites[1].id, assigneeId: greg.id, position: 10 });

    const t = await createTicket(kirsty, input(), [png()]);
    expect(t.assigneeId).toBe(greg.id);
    expect(t.status).toBe("new");
    expect(t.responseDueAt.getTime() - t.createdAt.getTime()).toBe(15 * 60000);
    expect(t.resolveDueAt.getTime() - t.createdAt.getTime()).toBe(240 * 60000);

    const d = await getTicketForViewer(t.id, kirsty);
    expect(d?.files).toHaveLength(1);
    // The number is remembered for next time.
    const u = await db.query.user.findFirst({ where: eq(schema.user.id, kirsty.id) });
    expect(u?.phone).toBe("07700 900412");
  });

  it("leaves it unassigned when the rule points at someone no longer in IT", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const ex = await makeUser("Ex Tech", "staff");
    await db.insert(schema.assignmentRule).values({ categoryId: null, siteId: null, assigneeId: ex.id, position: 10 });
    const t = await createTicket(kirsty, input(), []);
    expect(t.assigneeId).toBeNull();
  });

  it("rejects files that aren't images", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const exe = new File(["MZ"], "virus.exe", { type: "application/octet-stream" });
    await expect(createTicket(kirsty, input(), [exe])).rejects.toThrow(/isn't an image/);
  });
});

describe("who can see what", () => {
  it("staff only see their own tickets, and never internal notes", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const mark = await makeUser("Mark D", "staff");
    const greg = await makeUser("Greg J", "tech");
    const t = await createTicket(kirsty, input(), []);

    expect(await getTicketForViewer(t.id, mark)).toBeNull();
    expect(canView(greg, t)).toBe(true);

    await addMessage(t.id, greg, "On my way over.", false, []);
    await addMessage(t.id, greg, "Printhead looks worn.", true, [png("note.png")]);

    const staffView = await getTicketForViewer(t.id, kirsty);
    expect(staffView!.messages.map((m) => m.body)).toEqual(["On my way over."]);
    expect(staffView!.files).toHaveLength(0);
    const itView = await getTicketForViewer(t.id, greg);
    expect(itView!.messages).toHaveLength(2);
    expect(itView!.files).toHaveLength(1);

    // The internal note's screenshot can't be fetched by staff either.
    const fileId = itView!.files[0].id;
    expect(await getAttachmentForViewer(fileId, kirsty)).toBeNull();
    expect(await getAttachmentForViewer(fileId, greg)).not.toBeNull();
  });

  it("staff can't post internal notes", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const t = await createTicket(kirsty, input(), []);
    const m = await addMessage(t.id, kirsty, "secret?", true, []);
    expect(m.internal).toBe(false);
  });

  it("only IT can change tickets", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const t = await createTicket(kirsty, input(), []);
    await expect(updateTicket(t.id, kirsty, { status: "closed" })).rejects.toBeInstanceOf(TicketError);
  });
});

describe("working a ticket", () => {
  it("records first response, resolution, reopening and ratings", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const greg = await makeUser("Greg J", "tech");
    const t = await createTicket(kirsty, input(), []);

    await addMessage(t.id, greg, "Internal first", true, []);
    let row = await db.query.ticket.findFirst({ where: eq(schema.ticket.id, t.id) });
    expect(row!.firstResponseAt).toBeNull(); // internal notes don't count

    await addMessage(t.id, greg, "Looking now", false, []);
    row = await db.query.ticket.findFirst({ where: eq(schema.ticket.id, t.id) });
    expect(row!.firstResponseAt).not.toBeNull();

    await expect(rateTicket(t.id, kirsty, 5, "")).rejects.toThrow(/once it's resolved/);
    await updateTicket(t.id, greg, { status: "resolved" });
    row = await db.query.ticket.findFirst({ where: eq(schema.ticket.id, t.id) });
    expect(row!.resolvedAt).not.toBeNull();

    // Requester says it's still broken: back to In progress.
    await addMessage(t.id, kirsty, "Still blank", false, []);
    row = await db.query.ticket.findFirst({ where: eq(schema.ticket.id, t.id) });
    expect(row!.status).toBe("progress");
    expect(row!.resolvedAt).toBeNull();

    await updateTicket(t.id, greg, { status: "resolved" });
    await rateTicket(t.id, kirsty, 4, "Quick, thanks");
    row = await db.query.ticket.findFirst({ where: eq(schema.ticket.id, t.id) });
    expect(row!.satisfaction).toBe(4);
  });

  it("recalculates deadlines when priority changes", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const greg = await makeUser("Greg J", "tech");
    const t = await createTicket(kirsty, input({ priority: 4 }), []);
    const row = await updateTicket(t.id, greg, { priority: 2 });
    expect(row.resolveDueAt.getTime() - row.createdAt.getTime()).toBe(1440 * 60000);
  });

  it("only assigns to the IT team", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const greg = await makeUser("Greg J", "tech");
    const t = await createTicket(kirsty, input(), []);
    await expect(updateTicket(t.id, greg, { assigneeId: kirsty.id })).rejects.toThrow(/IT team/);
    const row = await updateTicket(t.id, greg, { assigneeId: greg.id });
    expect(row.assigneeId).toBe(greg.id);
  });

  it("lists views correctly", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const greg = await makeUser("Greg J", "tech");
    const a = await createTicket(kirsty, input({ title: "Mine", priority: 3 }), []);
    const b = await createTicket(kirsty, input({ title: "Nobody's", priority: 1 }), []);
    const c = await createTicket(kirsty, input({ title: "Done" }), []);
    await updateTicket(a.id, greg, { assigneeId: greg.id });
    await updateTicket(c.id, greg, { status: "closed" });

    const ids = async (view: Parameters<typeof listTickets>[0]["view"], q?: string) =>
      (await listTickets({ view, userId: greg.id, q })).map((t) => t.id);
    expect(await ids("open")).toEqual([b.id, a.id]); // P1 before P3
    expect(await ids("mine")).toEqual([a.id]);
    expect(await ids("unassigned")).toEqual([b.id]);
    expect(await ids("done")).toEqual([c.id]);
    expect(await ids("all", `IT-${b.id}`)).toEqual([b.id]);
    expect(await ids("all", "nobody")).toEqual([b.id]);
  });
});
