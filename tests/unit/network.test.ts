import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { createAsset } from "@/lib/assets";
import { DEFAULT_NET_SETTINGS, pollConnection, readSource, saveNetSettings } from "@/lib/network/poll";
import { dailyUptime, presenceFor, searchClients, siteDetail } from "@/lib/network/queries";
import { decryptSecret, encryptSecret, hint } from "@/lib/network/secret";
import { deviceKind } from "@/lib/network/sources/console";
import { SourceError } from "@/lib/network/types";
import { defaultFakeSites, FAKE_UNIFI_KEY, startFakeUnifi } from "../fake-unifi";
import { makeUser, resetData } from "./db-helpers";

const mails: string[] = [];
vi.spyOn(console, "log").mockImplementation((m: string) => void mails.push(String(m)));
vi.spyOn(console, "error").mockImplementation(() => {});

const PORT = 3196;
const URL_ = `http://localhost:${PORT}`;
let fake: Awaited<ReturnType<typeof startFakeUnifi>>;
let base: Awaited<ReturnType<typeof resetData>>;
beforeAll(async () => {
  fake = await startFakeUnifi(PORT);
});
afterAll(async () => fake.close());
beforeEach(async () => {
  base = await resetData();
  fake.state.sites = defaultFakeSites();
  mails.length = 0;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_WEBHOOK_URL;
});

async function addConn(kind: "console" | "cloud" | "example" = "console", key = FAKE_UNIFI_KEY) {
  const [c] = await db.insert(schema.netConnection).values({ name: kind, kind, url: URL_, apiKeyEnc: encryptSecret(key) }).returning();
  return c;
}
const minutes = (n: number, from = new Date("2026-10-29T10:00:00Z")) => new Date(from.getTime() + n * 60_000);

describe("reading UniFi", () => {
  it("reads a console: sites, kit with uplinks, connected devices", async () => {
    const snap = await readSource({ kind: "console", url: URL_, apiKey: FAKE_UNIFI_KEY, trustCert: false });
    const s = snap.sites[0];
    expect(s.name).toBe("Warehouse");
    expect(s.devices.map((d) => [d.name, d.kind, d.uplinkMac])).toEqual([
      ["Warehouse gateway", "gateway", null],
      ["Dispatch switch", "switch", "AA:BB:CC:00:00:01"],
      ["AP Dispatch", "ap", "AA:BB:CC:00:00:02"],
    ]);
    expect(s.devices[0]).toMatchObject({ mac: "AA:BB:CC:00:00:01", firmware: "4.1.13", uptimeSec: 86400 * 12, online: true });
    expect(s.clients!.map((c) => [c.name, c.wired, c.uplinkMac])).toEqual([
      ["NPI1A7F04", true, "AA:BB:CC:00:00:02"],
      ["Handheld 1", false, "AA:BB:CC:00:00:11"],
    ]);
    expect(s.wan.status).toBe("unknown");
  });

  it("follows pages of results", async () => {
    fake.state.sites[0].clients = Array.from({ length: 450 }, (_, i) => ({ name: `PC ${i}`, mac: `02:00:00:00:${(i >> 8).toString(16).padStart(2, "0")}:${(i & 255).toString(16).padStart(2, "0")}`, ip: `10.0.${i >> 8}.${i & 255}`, type: "WIRELESS" as const, uplinkId: "d-ap" }));
    const snap = await readSource({ kind: "console", url: URL_, apiKey: FAKE_UNIFI_KEY, trustCert: false });
    expect(snap.sites[0].clients).toHaveLength(450);
  });

  it("reads the cloud: internet line and counts, but no client list", async () => {
    const snap = await readSource({ kind: "cloud", url: URL_, apiKey: FAKE_UNIFI_KEY, trustCert: false });
    const s = snap.sites[0];
    expect(s.wan).toEqual({ status: "up", isp: "Virgin Media Business", latencyMs: 11 });
    expect(s.clients).toBeNull();
    expect(s.clientCount).toBe(2);
    expect(s.devices.map((d) => d.mac)).toContain("AA:BB:CC:00:00:11");
  });

  it("explains problems in plain words", async () => {
    await expect(readSource({ kind: "console", url: URL_, apiKey: "wrong", trustCert: false })).rejects.toThrow(/turned down the API key/);
    await expect(readSource({ kind: "console", url: "http://localhost:1", apiKey: "k", trustCert: false })).rejects.toThrow(/Couldn't reach localhost:1/);
    await expect(readSource({ kind: "console", url: "", apiKey: "k", trustCert: false })).rejects.toBeInstanceOf(SourceError);
  });

  it("recognises kit from its model", () => {
    expect(deviceKind({ model: "UDM-Pro" })).toBe("gateway");
    expect(deviceKind({ model: "U6-Lite" })).toBe("ap");
    expect(deviceKind({ model: "USW-24-PoE" })).toBe("switch");
    expect(deviceKind({ model: "Something", features: ["accessPoint"] })).toBe("ap");
  });

  it("keeps API keys encrypted", () => {
    const enc = encryptSecret("my-secret-key-1234");
    expect(enc).not.toContain("my-secret");
    expect(decryptSecret(enc)).toBe("my-secret-key-1234");
    expect(hint("my-secret-key-1234")).toBe("my-s…1234");
  });
});

describe("polling", () => {
  it("stores the network, matches our site and adds kit to the inventory", async () => {
    const greg = await makeUser("Greg J", "admin");
    await db.insert(schema.assetType).values({ name: "Network" });
    // The printer is already in the inventory: it should be linked, not duplicated.
    const switchAsset = await createAsset(greg, { name: "Dispatch switch", typeId: null, make: "", model: "", serial: "", status: "in_use", siteId: null, location: "", ipAddress: "", macAddress: "AA:BB:CC:00:00:02", purchaseDate: null, purchaseCostPence: null, supplier: "", warrantyUntil: null, notes: "" });
    const conn = await addConn();
    const r = await pollConnection(conn);
    expect(r.ok).toBe(true);
    const site = (await db.select().from(schema.netSite))[0];
    expect(site.siteId).toBe(base.sites.find((s) => s.name === "Warehouse")!.id);
    const devices = await db.select().from(schema.netDevice);
    expect(devices).toHaveLength(3);
    expect(devices.find((d) => d.mac === "AA:BB:CC:00:00:02")!.assetId).toBe(switchAsset.id);
    const assets = await db.select().from(schema.asset);
    expect(assets).toHaveLength(3); // switch reused, gateway and AP added
    expect(assets.find((a) => a.macAddress === "AA:BB:CC:00:00:11")).toMatchObject({ make: "Ubiquiti", model: "U6-Mesh", status: "in_use" });

    const presence = await presenceFor(["3c:52:82:1a:7f:04", "AA:BB:CC:00:00:11", "11:22:33:44:55:66"]);
    expect(presence.get("3C:52:82:1A:7F:04")).toMatchObject({ online: true, ip: "10.20.1.31", siteName: "Warehouse", via: "Dispatch switch" });
    expect(presence.get("AA:BB:CC:00:00:11")).toMatchObject({ kind: "device", online: true });
    expect(presence.has("11:22:33:44:55:66")).toBe(false);
    expect((await searchClients("10.20.1.31")).map((x) => x.c.name)).toEqual(["NPI1A7F04"]);
  });

  it("ignores blips, alerts after the delay, and records when it's back", async () => {
    await makeUser("Greg J", "admin");
    await saveNetSettings({ ...DEFAULT_NET_SETTINGS, alertAfterMin: 3 });
    const conn = await addConn();
    await pollConnection(conn, minutes(0));
    const ap = fake.state.sites[0].devices[2];

    // A one-minute blip: no alert, no history.
    ap.state = "OFFLINE";
    await pollConnection(conn, minutes(1));
    ap.state = "ONLINE";
    await pollConnection(conn, minutes(2));
    expect(await db.select().from(schema.netEvent)).toHaveLength(0);

    // A real outage.
    ap.state = "OFFLINE";
    await pollConnection(conn, minutes(10));
    await pollConnection(conn, minutes(12));
    expect(mails.filter((m) => m.includes("AP Dispatch offline"))).toHaveLength(0);
    await pollConnection(conn, minutes(13));
    await pollConnection(conn, minutes(14));
    expect(mails.filter((m) => m.includes("AP Dispatch offline at Warehouse"))).toHaveLength(1);
    ap.state = "ONLINE";
    await pollConnection(conn, minutes(20));
    expect(mails.filter((m) => m.includes("AP Dispatch back online"))).toHaveLength(1);
    const ev = await db.select().from(schema.netEvent).orderBy(schema.netEvent.id);
    expect(ev.map((e) => [e.type, e.at.toISOString()])).toEqual([
      ["device_down", minutes(10).toISOString()],
      ["device_up", minutes(20).toISOString()],
    ]);
    // Clients that dropped off are kept but marked not connected.
    fake.state.sites[0].clients.pop();
    await pollConnection(conn, minutes(21));
    const handheld = await db.query.netClient.findFirst({ where: eq(schema.netClient.name, "Handheld 1") });
    expect(handheld?.online).toBe(false);
  });

  it("raises a P1 ticket when a site's internet goes down, if asked to", async () => {
    await makeUser("Greg J", "admin");
    await saveNetSettings({ alertAfterMin: 2, autoTicket: true, addKitToInventory: false });
    await db.insert(schema.category).values({ name: "Network-ish" });
    const conn = await addConn("cloud");
    await pollConnection(conn, minutes(0));
    fake.state.sites[0].devices[0].state = "OFFLINE"; // gateway
    await pollConnection(conn, minutes(1));
    await pollConnection(conn, minutes(3));
    const t = await db.select().from(schema.ticket);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ title: "Internet down at Warehouse", priority: 1 });
    const site = (await db.select().from(schema.netSite))[0];
    expect(site.wanAlerted).toBe(true);
    fake.state.sites[0].devices[0].state = "ONLINE";
    await pollConnection(conn, minutes(30));
    expect(mails.some((m) => m.includes("is back after 29 min"))).toBe(true);
    const d = (await siteDetail(site.id))!;
    expect(d.lost).toBe(1);
    expect(d.s.clientsListed).toBe(false);
  });

  it("saves the error when a connection stops working", async () => {
    const conn = await addConn("console", "wrong-key");
    const r = await pollConnection(conn);
    expect(r.ok).toBe(false);
    const row = await db.query.netConnection.findFirst({ where: eq(schema.netConnection.id, conn.id) });
    expect(row?.lastError).toMatch(/API key/);
  });

  it("the example network works with no kit at all", async () => {
    const [c] = await db.insert(schema.netConnection).values({ name: "Example", kind: "example" }).returning();
    expect((await pollConnection(c)).ok).toBe(true);
    expect((await db.select().from(schema.netSite)).map((s) => s.name).sort()).toEqual(["Head Office", "Showroom", "Warehouse"]);
    expect((await db.select().from(schema.netDevice)).filter((d) => !d.online).map((d) => d.name)).toEqual(["AP Back office"]);
  });
});

describe("uptime", () => {
  it("works out the share of each day something was up", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    const h = (n: number) => new Date(now.getTime() - n * 3600_000);
    const days = dailyUptime(
      [
        { type: "wan_down", at: h(30) },
        { type: "wan_up", at: h(24 + 6) }, // nothing: same instant
        { type: "wan_down", at: h(12) },
        { type: "wan_up", at: h(9.6) }, // 2.4 hours = 10% of today
      ],
      "wan_down",
      "wan_up",
      3,
      now,
    );
    expect(days.map((d) => Math.round(d.upPct))).toEqual([100, 100, 90]);
    expect(dailyUptime([], "a", "b", 2, now, true).map((d) => d.upPct)).toEqual([0, 0]);
  });
});
