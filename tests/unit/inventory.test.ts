import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { checkIn, checkOut, createAsset, findAssetByTag, getAsset, listAssets, nextTag, normaliseMac, normaliseTag, updateAsset, type AssetInput } from "@/lib/assets";
import { importAssets, importStock, parseCsv, parseDate, parseMoney } from "@/lib/csv-import";
import { listLicences, saveLicence } from "@/lib/licences";
import { comingUp, sendDailyReminders, ukToday, addDays } from "@/lib/reminders";
import { createStockItem, listStock, moveStock, stockFitting } from "@/lib/stock";
import { createTicket, updateTicket } from "@/lib/tickets";
import { FAKE_CHANNEL, FAKE_TOKEN, startFakeSlack } from "../fake-slack";
import { makeUser, png, resetData } from "./db-helpers";

const mails: string[] = [];
vi.spyOn(console, "log").mockImplementation((m: string) => void mails.push(String(m)));
vi.spyOn(console, "error").mockImplementation(() => {});

let base: Awaited<ReturnType<typeof resetData>>;
let fake: Awaited<ReturnType<typeof startFakeSlack>>;
beforeAll(async () => {
  fake = await startFakeSlack(3197, {});
});
afterAll(async () => fake.close());
beforeEach(async () => {
  base = await resetData();
  mails.length = 0;
  fake.calls.length = 0;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_WEBHOOK_URL;
});

const laptop = (over: Partial<AssetInput> = {}): AssetInput => ({
  name: "Dell Latitude 5440",
  typeId: base.types[0].id,
  make: "Dell",
  model: "Latitude 5440",
  serial: "J7H2XK3",
  status: "spare",
  siteId: base.sites[0].id,
  location: "IT cupboard",
  ipAddress: "",
  macAddress: "",
  purchaseDate: "2024-03-14",
  purchaseCostPence: 84900,
  supplier: "Dell",
  warrantyUntil: "2027-03-14",
  notes: "",
  ...over,
});

describe("tags", () => {
  it("hands out GD-00001, GD-00002… and never reuses a typed tag", async () => {
    const greg = await makeUser("Greg J", "tech");
    expect(await nextTag()).toBe("GD-00001");
    const a = await createAsset(greg, laptop());
    const b = await createAsset(greg, laptop(), [], "gd 41");
    const c = await createAsset(greg, laptop());
    expect([a.tag, b.tag, c.tag]).toEqual(["GD-00001", "GD-00041", "GD-00042"]);
    await expect(createAsset(greg, laptop(), [], "GD-41")).rejects.toThrow(/already used/);
  });
  it("tidies tags and MAC addresses", () => {
    expect(normaliseTag(" gd-7 ")).toBe("GD-00007");
    expect(normaliseTag("ST-0003")).toBe("ST-0003");
    expect(normaliseMac("3c-52-82-1a-7f-04")).toBe("3C:52:82:1A:7F:04");
  });
});

describe("assets", () => {
  it("only lets IT change inventory", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    await expect(createAsset(kirsty, laptop())).rejects.toThrow(/IT team/);
  });

  it("checks IP and MAC addresses", async () => {
    const greg = await makeUser("Greg J", "tech");
    await expect(createAsset(greg, laptop({ ipAddress: "10.20.1.300" }))).rejects.toThrow(/isn't an IP address/);
    await expect(createAsset(greg, laptop({ macAddress: "nope" }))).rejects.toThrow(/isn't a MAC address/);
    const ok = await createAsset(greg, laptop({ ipAddress: "10.20.1.31", macAddress: "3c528 21a7f04" }));
    expect(ok.macAddress).toBe("3C:52:82:1A:7F:04");
  });

  it("keeps a history of edits, check-outs and check-ins", async () => {
    const greg = await makeUser("Greg J", "tech");
    const mark = await makeUser("Mark D", "staff");
    const a = await createAsset(greg, laptop(), [png("front.png")]);
    await updateAsset(greg, a.id, laptop({ location: "Accounts", serial: "NEW1" }));
    await checkOut(greg, a.id, { userId: mark.id, name: "" }, "with charger");
    let d = (await getAsset(a.id))!;
    expect(d.a.status).toBe("in_use");
    expect(d.assignedTo).toBe("Mark D");
    await checkIn(greg, a.id, { siteId: null, location: "IT cupboard" }, "wiped");
    await checkOut(greg, a.id, { userId: null, name: "Dispatch" });
    d = (await getAsset(a.id))!;
    expect(d.assignedTo).toBe("Dispatch");
    expect(d.photos).toHaveLength(1);
    expect(d.events.map((e) => e.type).reverse()).toEqual(["created", "edited", "checked_out", "checked_in", "checked_out"]);
    expect(d.events.find((e) => e.type === "edited")!.data.fields).toEqual(["Serial", "Location"]);
    expect(d.events.find((e) => e.type === "checked_in")!.data).toMatchObject({ from: "Mark D", location: "IT cupboard", note: "wiped" });
  });

  it("finds kit by tag, serial, IP, person or place", async () => {
    const greg = await makeUser("Greg J", "tech");
    const mark = await makeUser("Mark D", "staff");
    const a = await createAsset(greg, laptop());
    const p = await createAsset(greg, laptop({ name: "HP LaserJet M507", typeId: base.types[1].id, model: "LaserJet M507", ipAddress: "10.20.1.31", serial: "PHB" }));
    await checkOut(greg, a.id, { userId: mark.id, name: "" });
    const names = async (q: string) => (await listAssets({ q })).map((x) => x.name);
    expect(await names("gd 1")).toEqual(["Dell Latitude 5440"]);
    expect(await names("10.20.1")).toEqual(["HP LaserJet M507"]);
    expect(await names("mark")).toEqual(["Dell Latitude 5440"]);
    expect((await listAssets({ printersOnly: true })).map((x) => x.id)).toEqual([p.id]);
    expect((await findAssetByTag("gd-2"))?.id).toBe(p.id);
  });

  it("hides retired kit unless asked", async () => {
    const greg = await makeUser("Greg J", "tech");
    const a = await createAsset(greg, laptop());
    await updateAsset(greg, a.id, laptop({ status: "retired" }));
    expect(await listAssets()).toHaveLength(0);
    expect(await listAssets({ status: "retired" })).toHaveLength(1);
  });

  it("links tickets, including ones raised from a label", async () => {
    const greg = await makeUser("Greg J", "tech");
    const kirsty = await makeUser("Kirsty P", "staff");
    const p = await createAsset(greg, laptop({ name: "Zebra ZD421", typeId: base.types[1].id }));
    const t = await createTicket(kirsty, { title: "Blank labels", description: "x", priority: 2, categoryId: null, siteId: null, location: "", contactPhone: "", assetId: p.id }, []);
    const t2 = await createTicket(kirsty, { title: "Jam", description: "x", priority: 3, categoryId: null, siteId: null, location: "", contactPhone: "" }, []);
    await updateTicket(t2.id, greg, { assetId: p.id });
    const d = (await getAsset(p.id))!;
    expect(d.tickets.map((x) => x.id).sort()).toEqual([t.id, t2.id].sort());
    expect((await listAssets())[0].openTickets).toBe(2);
  });
});

describe("stock", () => {
  it("takes and adds safely, and never goes below zero", async () => {
    const greg = await makeUser("Greg J", "tech");
    const toner = await createStockItem(greg, { name: "HP 59A toner", category: "Toner", siteId: null, location: "Cupboard B", minQuantity: 2, supplier: "Insight", fits: "HP LaserJet M507", notes: "" }, 3);
    expect(toner.code).toBe("ST-0001");
    expect((await moveStock(greg, toner.id, { delta: -1, reason: "taken" })).quantity).toBe(2);
    await expect(moveStock(greg, toner.id, { delta: 5, reason: "taken" })).rejects.toThrow(/Only 2 left/);
    expect((await moveStock(greg, toner.id, { delta: 4, reason: "received" })).quantity).toBe(6);
    expect((await moveStock(greg, toner.id, { count: 1, reason: "counted" })).quantity).toBe(1);
    // Two people taking the last one at the same time: only one succeeds.
    const results = await Promise.allSettled([moveStock(greg, toner.id, { delta: -1, reason: "taken" }), moveStock(greg, toner.id, { delta: -1, reason: "taken" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const row = await db.query.stockItem.findFirst({ where: eq(schema.stockItem.id, toner.id) });
    expect(row?.quantity).toBe(0);
  });

  it("alerts IT once, when an item drops below its minimum", async () => {
    process.env.SLACK_API_BASE = "http://localhost:3197/api";
    process.env.SLACK_BOT_TOKEN = FAKE_TOKEN;
    process.env.SLACK_CHANNEL = FAKE_CHANNEL;
    const greg = await makeUser("Greg J", "tech");
    const item = await createStockItem(greg, { name: "MK295 keyboard", category: "Peripherals", siteId: null, location: "", minQuantity: 3, supplier: "", fits: "", notes: "" }, 4);
    await moveStock(greg, item.id, { delta: -1, reason: "taken" }); // 3, not low
    expect(mails.filter((m) => m.includes("Low stock"))).toHaveLength(0);
    await moveStock(greg, item.id, { delta: -1, reason: "taken" }); // 2, now low
    await moveStock(greg, item.id, { delta: -1, reason: "taken" }); // 1, still low: no repeat
    expect(mails.filter((m) => m.includes("Low stock: MK295 keyboard (2 left)"))).toHaveLength(1);
    expect(fake.calls.filter((c) => c.method === "chat.postMessage").map((c) => c.body.text)).toEqual(["Low stock: MK295 keyboard, 2 left (minimum 3)"]);
    expect((await listStock({ lowOnly: true })).map((x) => x.name)).toEqual(["MK295 keyboard"]);
  });

  it("matches toner to printers by model", async () => {
    const greg = await makeUser("Greg J", "tech");
    await createStockItem(greg, { name: "HP 59A toner", category: "Toner", siteId: null, location: "", minQuantity: 0, supplier: "", fits: "HP LaserJet M507", notes: "" }, 1);
    await createStockItem(greg, { name: "HP 89A toner", category: "Toner", siteId: null, location: "", minQuantity: 0, supplier: "", fits: "HP LaserJet M528", notes: "" }, 1);
    expect((await stockFitting("LaserJet M507")).map((x) => x.name)).toEqual(["HP 59A toner"]);
    expect(await stockFitting("")).toEqual([]);
  });
});

describe("reminders", () => {
  it("lists what's coming up and sends one summary a day", async () => {
    const greg = await makeUser("Greg J", "admin");
    const today = ukToday();
    await createAsset(greg, laptop({ warrantyUntil: addDays(today, 7) }));
    await createAsset(greg, laptop({ warrantyUntil: addDays(today, 90) }));
    await saveLicence(greg, null, { name: "Microsoft 365", supplier: "", seats: 48, renewsOn: addDays(today, 14), costPence: null, notes: "" });
    await createStockItem(greg, { name: "Labels", category: "", siteId: null, location: "", minQuantity: 5, supplier: "", fits: "", notes: "" }, 2);

    const c = await comingUp();
    expect(c.warranties.map((w) => w.days)).toEqual([7]);
    expect(c.licences.map((l) => l.name)).toEqual(["Microsoft 365"]);
    expect(c.lowStock.map((s) => s.name)).toEqual(["Labels"]);

    const first = await sendDailyReminders();
    expect(first.sent).toBe(true);
    expect(first.lines).toEqual([
      `Licence renews in 14 days: Microsoft 365 (${addDays(today, 14)})`,
      `Warranty ends in 7 days: GD-00001 Dell Latitude 5440 (${addDays(today, 7)})`,
      "Low stock: Labels, 2 left (minimum 5)",
    ]);
    expect((await sendDailyReminders()).reason).toBe("already sent today");
    expect(await listLicences()).toHaveLength(1);
  });
});

describe("spreadsheet import", () => {
  it("reads CSV with quotes, commas and line breaks", () => {
    expect(parseCsv('﻿Name,Notes\r\n"Dell, 14""","line one\nline two"\n\n')).toEqual([
      ["Name", "Notes"],
      ['Dell, 14"', "line one\nline two"],
    ]);
  });
  it("understands UK dates and money", () => {
    expect(parseDate("31/12/2026")).toBe("2026-12-31");
    expect(parseDate("1-3-27")).toBe("2027-03-01");
    expect(parseDate("31/02/2026")).toBe("bad");
    expect(parseMoney("£1,249.99")).toBe(124999);
    expect(parseMoney("lots")).toBe("bad");
  });

  it("checks first, then imports kit, updating rows whose tag exists", async () => {
    const greg = await makeUser("Greg J", "admin");
    const mark = await makeUser("Mark D", "staff");
    const existing = await createAsset(greg, laptop());
    const csv = [
      "Asset Tag,Name,Type,Serial Number,Site,Assigned To,IP Address,Purchase Date,Cost,Warranty Expiry,Status",
      `${existing.tag},Dell Latitude 5440,Laptop,J7H2XK3,Head Office,${mark.email},,14/03/2024,849,14/03/2027,In use`,
      ",Zebra ZD421,Label printer,D4J212905,Warehouse,Dispatch,10.20.1.45,11/01/2024,£329.00,11/01/2027,",
      ",Raspberry Pi 5,Raspberry Pi,,Nowhere,,999.1.1.1,,,,",
      ",,Laptop,,,,,,,,",
    ].join("\n");

    const check = await importAssets(greg, csv, false);
    expect(check.rows.map((r) => [r.line, r.action])).toEqual([
      [2, "update"],
      [3, "create"],
      [4, "skip"],
      [5, "skip"],
    ]);
    expect(check.rows[1].problems).toContain('New type "Label printer" will be added');
    expect(check.rows[2].problems.join(" ")).toMatch(/Site "Nowhere".*isn't an IP address/);
    expect(await listAssets()).toHaveLength(1); // nothing saved yet

    const done = await importAssets(greg, csv, true);
    expect([done.created, done.updated]).toEqual([1, 1]);
    const all = await listAssets();
    expect(all.map((a) => [a.name, a.assignedTo, a.status])).toEqual(
      expect.arrayContaining([
        ["Dell Latitude 5440", "Mark D", "in_use"],
        ["Zebra ZD421", "Dispatch", "in_use"],
      ]),
    );
    const zebra = all.find((a) => a.name === "Zebra ZD421")!;
    expect(zebra.typeName).toBe("Label printer");
    expect(zebra.isPrinter).toBe(true);
    expect(zebra.warrantyUntil).toBe("2027-01-11");
  });

  it("imports stock and skips duplicates", async () => {
    const greg = await makeUser("Greg J", "admin");
    const csv = "Item,Category,Qty,Reorder level,Location\nHP 59A toner,Toner,3,2,Cupboard B\nHP 59A toner,Toner,1,1,\nMouse,Peripherals,lots,1,";
    const r = await importStock(greg, csv, true);
    expect(r.created).toBe(1);
    expect(r.rows.map((x) => x.ok)).toEqual([true, false, false]);
    expect((await listStock()).map((s) => [s.name, s.quantity, s.minQuantity])).toEqual([["HP 59A toner", 3, 2]]);
  });
});
