// Reading network data for the pages.
import { and, asc, desc, eq, gte, ilike, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { normMac } from "./types";

const { netConnection, netSite, netDevice, netClient, netEvent, site } = schema;

export async function connections() {
  return db.select().from(netConnection).orderBy(asc(netConnection.id));
}

export type SiteCard = Awaited<ReturnType<typeof overview>>["sites"][number];

export async function overview() {
  const [conns, sites, devices] = await Promise.all([
    connections(),
    db
      .select({ s: netSite, ourSite: site.name, connName: netConnection.name, connKind: netConnection.kind, lastOkAt: netConnection.lastOkAt, lastError: netConnection.lastError })
      .from(netSite)
      .innerJoin(netConnection, eq(netConnection.id, netSite.connectionId))
      .leftJoin(site, eq(site.id, netSite.siteId))
      .where(eq(netConnection.enabled, true))
      .orderBy(asc(site.position), asc(netSite.name)),
    db.select().from(netDevice),
  ]);
  return {
    connections: conns,
    sites: sites.map((r) => {
      const kit = devices.filter((d) => d.netSiteId === r.s.id);
      return {
        ...r.s,
        ourSite: r.ourSite,
        connName: r.connName,
        connKind: r.connKind,
        stale: !r.lastOkAt || Date.now() - r.lastOkAt.getTime() > 10 * 60_000,
        lastOkAt: r.lastOkAt,
        lastError: r.lastError,
        devicesTotal: kit.length,
        offline: kit.filter((d) => !d.online),
        gateway: kit.find((d) => d.kind === "gateway") ?? null,
      };
    }),
  };
}

export async function recentEvents(limit = 20, netSiteId?: number) {
  const dev = alias(netDevice, "dev");
  return db
    .select({ e: netEvent, siteName: netSite.name, deviceName: dev.name })
    .from(netEvent)
    .innerJoin(netSite, eq(netSite.id, netEvent.netSiteId))
    .leftJoin(dev, eq(dev.id, netEvent.deviceId))
    .where(netSiteId ? eq(netEvent.netSiteId, netSiteId) : undefined)
    .orderBy(desc(netEvent.at), desc(netEvent.id))
    .limit(limit);
}

type Ev = { type: string; at: Date };

/**
 * Share of each day that something was up, from its down/up events, newest day last.
 * `days` is counted back from `now`; days with no events count as fully up.
 */
export function dailyUptime(events: Ev[], downType: string, upType: string, days: number, now = new Date(), downNow = false) {
  const dayMs = 864e5;
  const end = now.getTime();
  const start = end - days * dayMs;
  // Turn events into down intervals.
  const intervals: [number, number][] = [];
  let open: number | null = null;
  let lastUp = start;
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (e.type === downType && open === null) open = e.at.getTime();
    else if (e.type === upType && open !== null) {
      intervals.push([open, e.at.getTime()]);
      lastUp = e.at.getTime();
      open = null;
    }
  }
  // Down now with no event saying when: count it as down since it was last seen coming back.
  if (open !== null || downNow) intervals.push([open ?? lastUp, end]);
  return Array.from({ length: days }, (_, i) => {
    const a = start + i * dayMs;
    const b = a + dayMs;
    const down = intervals.reduce((n, [x, y]) => n + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
    return { from: new Date(a), upPct: Math.max(0, 100 - (down / dayMs) * 100) };
  });
}

export async function siteDetail(id: number) {
  const row = await db
    .select({ s: netSite, ourSite: site.name, conn: netConnection })
    .from(netSite)
    .innerJoin(netConnection, eq(netConnection.id, netSite.connectionId))
    .leftJoin(site, eq(site.id, netSite.siteId))
    .where(eq(netSite.id, id));
  if (!row[0]) return null;
  const since = new Date(Date.now() - 30 * 864e5);
  const [devices, clients, events] = await Promise.all([
    db.select().from(netDevice).where(eq(netDevice.netSiteId, id)).orderBy(asc(netDevice.kind), asc(netDevice.name)),
    db.select().from(netClient).where(eq(netClient.netSiteId, id)).orderBy(desc(netClient.online), asc(netClient.name)),
    db.select().from(netEvent).where(and(eq(netEvent.netSiteId, id), gte(netEvent.at, since))).orderBy(asc(netEvent.at)),
  ]);
  const wanEvents = events.filter((e) => e.type.startsWith("wan_"));
  return {
    ...row[0],
    devices,
    clients,
    uptime: dailyUptime(wanEvents, "wan_down", "wan_up", 14, new Date(), row[0].s.wanAlerted),
    lost: wanEvents.filter((e) => e.type === "wan_down").length,
  };
}

export async function deviceDetail(id: number) {
  const d = await db.query.netDevice.findFirst({ where: eq(netDevice.id, id) });
  if (!d) return null;
  const [s, clients, events, uplink] = await Promise.all([
    db.query.netSite.findFirst({ where: eq(netSite.id, d.netSiteId) }),
    db.select().from(netClient).where(and(eq(netClient.netSiteId, d.netSiteId), eq(netClient.uplinkMac, d.mac), eq(netClient.online, true))).orderBy(asc(netClient.name)),
    db.select().from(netEvent).where(eq(netEvent.deviceId, id)).orderBy(desc(netEvent.at)).limit(50),
    d.uplinkMac ? db.query.netDevice.findFirst({ where: and(eq(netDevice.netSiteId, d.netSiteId), eq(netDevice.mac, d.uplinkMac)) }) : null,
  ]);
  return { d, site: s!, clients, events, uplink: uplink ?? null, uptime: dailyUptime(events, "device_down", "device_up", 14, new Date(), !d.online) };
}

export async function searchClients(q: string, limit = 200) {
  const term = q.trim();
  const up = alias(netDevice, "up");
  return db
    .select({ c: netClient, siteName: netSite.name, netSiteId: netSite.id, via: up.name })
    .from(netClient)
    .innerJoin(netSite, eq(netSite.id, netClient.netSiteId))
    .leftJoin(up, and(eq(up.netSiteId, netClient.netSiteId), eq(up.mac, netClient.uplinkMac)))
    .where(term ? or(ilike(netClient.name, `%${term}%`), ilike(netClient.ip, `%${term}%`), ilike(netClient.mac, `%${normMac(term).length === 17 ? normMac(term) : term}%`)) : undefined)
    .orderBy(desc(netClient.online), asc(netClient.name))
    .limit(limit);
}

export type NetPresence = { online: boolean; ip: string; siteName: string; via: string | null; lastSeenAt: Date | null; since: Date | null; kind: "device" | "client"; netSiteId: number; deviceId?: number };

/** Is this MAC address on the network? Used on inventory and printer pages. */
export async function presenceFor(macs: string[]): Promise<Map<string, NetPresence>> {
  const list = [...new Set(macs.map(normMac).filter((m) => m.length === 17))];
  const out = new Map<string, NetPresence>();
  if (!list.length) return out;
  const up = alias(netDevice, "up");
  const [devs, clients] = await Promise.all([
    db.select({ d: netDevice, siteName: netSite.name }).from(netDevice).innerJoin(netSite, eq(netSite.id, netDevice.netSiteId)).where(inArray(netDevice.mac, list)),
    db
      .select({ c: netClient, siteName: netSite.name, via: up.name })
      .from(netClient)
      .innerJoin(netSite, eq(netSite.id, netClient.netSiteId))
      .leftJoin(up, and(eq(up.netSiteId, netClient.netSiteId), eq(up.mac, netClient.uplinkMac)))
      .where(inArray(netClient.mac, list))
      .orderBy(desc(netClient.lastSeenAt)),
  ]);
  for (const { c, siteName, via } of clients) {
    if (!out.has(c.mac)) out.set(c.mac, { online: c.online, ip: c.ip, siteName, via, lastSeenAt: c.lastSeenAt, since: c.connectedAt, kind: "client", netSiteId: c.netSiteId });
  }
  for (const { d, siteName } of devs) {
    out.set(d.mac, { online: d.online, ip: d.ip, siteName, via: null, lastSeenAt: d.lastSeenAt, since: d.online && d.uptimeSec != null ? new Date(Date.now() - d.uptimeSec * 1000) : d.downSince, kind: "device", netSiteId: d.netSiteId, deviceId: d.id });
  }
  return out;
}

/** Short summary for the dashboard. */
export async function networkSummary() {
  const o = await overview();
  if (o.sites.length === 0) return null;
  return o.sites.map((s) => ({
    id: s.id,
    name: s.ourSite ?? s.name,
    wan: s.wanStatus,
    offline: s.offline.length,
    clients: s.clientCount,
    latencyMs: s.latencyMs,
    stale: s.stale,
  }));
}

