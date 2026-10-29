// Reads every UniFi connection and brings the database up to date.
// Something has to stay down for a few minutes before it counts as an outage, so blips don't page anyone.
import { and, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { link, sendMail } from "../notify";
import { clip, esc, postToChannel, slackMode } from "../slack";
import { decryptSecret } from "./secret";
import { readCloud } from "./sources/cloud";
import { readConsole } from "./sources/console";
import { readExample } from "./sources/example";
import { normMac, SourceError, type ConnectionConfig, type SiteSnap, type Snapshot } from "./types";

const { netConnection, netSite, netDevice, netClient, netEvent, appSetting, asset, assetType, assetEvent, user } = schema;

export type NetSettings = {
  /** Minutes something must be down before it's an outage. */
  alertAfterMin: number;
  /** Raise a P1 ticket when a site's internet goes down. */
  autoTicket: boolean;
  /** Add UniFi kit to the inventory when it's first seen. */
  addKitToInventory: boolean;
};

export const DEFAULT_NET_SETTINGS: NetSettings = { alertAfterMin: 3, autoTicket: false, addKitToInventory: true };

export async function getNetSettings(): Promise<NetSettings> {
  const row = await db.query.appSetting.findFirst({ where: eq(appSetting.key, "network") });
  return { ...DEFAULT_NET_SETTINGS, ...((row?.value as Partial<NetSettings>) ?? {}) };
}

export async function saveNetSettings(s: NetSettings) {
  await db
    .insert(appSetting)
    .values({ key: "network", value: s })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: s, updatedAt: new Date() } });
}

export function readSource(cfg: ConnectionConfig): Promise<Snapshot> {
  if (cfg.kind === "example") return Promise.resolve(readExample());
  if (cfg.kind === "cloud") return readCloud(cfg);
  return readConsole(cfg);
}

export const configOf = (c: typeof netConnection.$inferSelect): ConnectionConfig => ({
  kind: c.kind as ConnectionConfig["kind"],
  url: c.url,
  apiKey: decryptSecret(c.apiKeyEnc),
  trustCert: c.trustCert,
});

/* ---------- alerts ---------- */

async function alertIT(subject: string, text: string, slackText: string) {
  const it = await db.select({ email: user.email }).from(user).where(inArray(user.role, ["tech", "admin"]));
  await sendMail({ to: it.map((r) => r.email), subject, text });
  if (slackMode() !== "off") await postToChannel({ text: slackText, blocks: [{ type: "section", text: { type: "mrkdwn", text: slackText } }] });
}

const minutes = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

async function raiseOutageTicket(site: typeof netSite.$inferSelect, since: Date) {
  // Imported here to avoid a cycle (tickets → alerts → …).
  const { createTicket } = await import("../tickets");
  const admin = await db.query.user.findFirst({ where: eq(user.role, "admin") });
  if (!admin) return null;
  const cat = await db.query.category.findFirst({ where: sql`lower(${schema.category.name}) = 'network'` });
  const t = await createTicket(
    { id: admin.id, name: admin.name, email: admin.email, role: "admin", phone: admin.phone },
    {
      title: `Internet down at ${site.name}`,
      description: `Raised automatically: UniFi has reported the internet at ${site.name} as down since ${since.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })}.`,
      priority: 1,
      categoryId: cat?.id ?? null,
      siteId: site.siteId,
      location: "",
      contactPhone: "",
    },
    [],
  );
  return t.id;
}

/* ---------- syncing one site ---------- */

async function syncSite(connectionId: number, snap: SiteSnap, settings: NetSettings, now: Date) {
  const ourSites = await db.select().from(schema.site);
  const existing = await db.query.netSite.findFirst({ where: and(eq(netSite.connectionId, connectionId), eq(netSite.externalId, snap.externalId)) });
  const guessSite = ourSites.find((s) => s.name.toLowerCase() === snap.name.toLowerCase())?.id ?? null;
  const values = {
    name: snap.name,
    wanStatus: snap.wan.status,
    isp: snap.wan.isp,
    latencyMs: snap.wan.latencyMs,
    clientCount: snap.clients ? snap.clients.length : snap.clientCount,
    clientsListed: snap.clients !== null,
    updatedAt: now,
  };
  const [site] = existing
    ? await db.update(netSite).set(values).where(eq(netSite.id, existing.id)).returning()
    : await db.insert(netSite).values({ ...values, connectionId, externalId: snap.externalId, siteId: guessSite }).returning();
  const threshold = settings.alertAfterMin * 60_000;
  const url = link(`/it/network/${site.id}`);

  // Internet line.
  if (snap.wan.status === "down") {
    const since = site.wanDownSince ?? now;
    if (!site.wanDownSince) await db.update(netSite).set({ wanDownSince: now }).where(eq(netSite.id, site.id));
    if (!site.wanAlerted && now.getTime() - since.getTime() >= threshold) {
      const ticketId = settings.autoTicket ? await raiseOutageTicket(site, since) : null;
      await db.update(netSite).set({ wanAlerted: true }).where(eq(netSite.id, site.id));
      await db.insert(netEvent).values({ netSiteId: site.id, type: "wan_down", at: since, data: ticketId ? { ticketId } : {} });
      await alertIT(
        `Internet down at ${site.name}`,
        `UniFi reports the internet at ${site.name} has been down since ${since.toISOString()}.${ticketId ? `\nTicket IT-${ticketId} has been raised.` : ""}\n\n${url}`,
        `:red_circle: *Internet down at ${esc(site.name)}* (for ${minutes(now.getTime() - since.getTime())})${ticketId ? ` · ticket IT-${ticketId}` : ""}\n<${url}|Open in IT Hub>`,
      );
    }
  } else if (site.wanDownSince) {
    if (site.wanAlerted) {
      const down = now.getTime() - site.wanDownSince.getTime();
      await db.insert(netEvent).values({ netSiteId: site.id, type: "wan_up", at: now, data: { downMs: down } });
      await alertIT(`Internet back at ${site.name}`, `The internet at ${site.name} is back after ${minutes(down)}.\n\n${url}`, `:large_green_circle: *Internet back at ${esc(site.name)}* after ${minutes(down)}`);
    }
    await db.update(netSite).set({ wanDownSince: null, wanAlerted: false }).where(eq(netSite.id, site.id));
  }

  // Network kit.
  const settingsTypes = settings.addKitToInventory ? await db.select().from(assetType) : [];
  const networkTypeId = settingsTypes.find((t) => t.name.toLowerCase() === "network")?.id ?? null;
  for (const d of snap.devices) {
    const mac = d.mac || `ID:${d.externalId}`;
    const prev = await db.query.netDevice.findFirst({ where: and(eq(netDevice.netSiteId, site.id), eq(netDevice.mac, mac)) });
    const base = { externalId: d.externalId, name: d.name, model: d.model, kind: d.kind, ip: d.ip, firmware: d.firmware, online: d.online, uptimeSec: d.uptimeSec, uplinkMac: d.uplinkMac, updatedAt: now, ...(d.online ? { lastSeenAt: now } : {}) };
    const [row] = prev
      ? await db.update(netDevice).set(base).where(eq(netDevice.id, prev.id)).returning()
      : await db.insert(netDevice).values({ ...base, netSiteId: site.id, mac, lastSeenAt: d.online ? now : null }).returning();

    if (!d.online) {
      const since = row.downSince ?? now;
      if (!row.downSince) await db.update(netDevice).set({ downSince: now }).where(eq(netDevice.id, row.id));
      // A device seen offline on its very first poll was already down; don't pretend we know when.
      if (!row.alerted && prev && now.getTime() - since.getTime() >= threshold) {
        await db.update(netDevice).set({ alerted: true }).where(eq(netDevice.id, row.id));
        await db.insert(netEvent).values({ netSiteId: site.id, deviceId: row.id, type: "device_down", at: since });
        await alertIT(
          `${d.name} offline at ${site.name}`,
          `UniFi reports ${d.name} (${d.model}) at ${site.name} has been offline since ${since.toISOString()}.\n\n${url}`,
          `:warning: *${esc(d.name)}* (${esc(d.model)}) is offline at ${esc(site.name)} (for ${minutes(now.getTime() - since.getTime())})\n<${url}|Open in IT Hub>`,
        );
      }
      if (!prev) {
        // Already offline when first seen: record it quietly so the history and "back online" make sense.
        await db.update(netDevice).set({ alerted: true }).where(eq(netDevice.id, row.id));
        await db.insert(netEvent).values({ netSiteId: site.id, deviceId: row.id, type: "device_down", at: now, data: { firstSeen: true } });
      }
    } else if (row.downSince) {
      if (row.alerted && prev) {
        const down = now.getTime() - row.downSince.getTime();
        await db.insert(netEvent).values({ netSiteId: site.id, deviceId: row.id, type: "device_up", at: now, data: { downMs: down } });
        await alertIT(`${d.name} back online`, `${d.name} at ${site.name} is back after ${minutes(down)}.\n\n${url}`, `:white_check_mark: *${esc(d.name)}* is back online at ${esc(site.name)} after ${minutes(down)}`);
      }
      await db.update(netDevice).set({ downSince: null, alerted: false }).where(eq(netDevice.id, row.id));
    }

    // Put UniFi kit in the inventory, matched by MAC address.
    if (settings.addKitToInventory && !row.assetId && d.mac) {
      const match = await db.query.asset.findFirst({ where: eq(asset.macAddress, d.mac) });
      let assetId = match?.id ?? null;
      if (!assetId) {
        const { nextTag } = await import("../assets");
        const [created] = await db
          .insert(asset)
          .values({ tag: await nextTag(), name: d.name, typeId: networkTypeId, make: "Ubiquiti", model: d.model, status: "in_use", siteId: site.siteId, location: "", ipAddress: d.ip, macAddress: d.mac, notes: "Added automatically from UniFi." })
          .returning();
        await db.insert(assetEvent).values({ assetId: created.id, type: "created", data: { source: "UniFi" } });
        assetId = created.id;
      }
      await db.update(netDevice).set({ assetId }).where(eq(netDevice.id, row.id));
    }
  }

  // Connected devices (not available from the cloud source).
  if (snap.clients) {
    const seen: string[] = [];
    for (const c of snap.clients) {
      seen.push(c.mac);
      await db
        .insert(netClient)
        .values({ netSiteId: site.id, mac: c.mac, name: c.name, ip: c.ip, wired: c.wired, uplinkMac: c.uplinkMac, connectedAt: c.connectedAt, online: true, lastSeenAt: now })
        .onConflictDoUpdate({
          target: [netClient.netSiteId, netClient.mac],
          set: { name: c.name, ip: c.ip, wired: c.wired, uplinkMac: c.uplinkMac, connectedAt: c.connectedAt, online: true, lastSeenAt: now },
        });
    }
    await db
      .update(netClient)
      .set({ online: false })
      .where(and(eq(netClient.netSiteId, site.id), seen.length ? notInArray(netClient.mac, seen) : undefined));
    // Forget devices not seen for 30 days.
    await db.delete(netClient).where(and(eq(netClient.netSiteId, site.id), lt(netClient.lastSeenAt, new Date(now.getTime() - 30 * 864e5))));
  }
  return site;
}

/* ---------- polling ---------- */

export async function pollConnection(conn: typeof netConnection.$inferSelect, now = new Date()) {
  const settings = await getNetSettings();
  try {
    const snap = await readSource(configOf(conn));
    for (const s of snap.sites) await syncSite(conn.id, s, settings, now);
    await db.update(netConnection).set({ lastPollAt: now, lastOkAt: now, lastError: null }).where(eq(netConnection.id, conn.id));
    return { ok: true as const, sites: snap.sites.length };
  } catch (e) {
    const message = e instanceof SourceError ? e.message : `Unexpected problem: ${e instanceof Error ? clip(e.message, 200) : String(e)}`;
    await db.update(netConnection).set({ lastPollAt: now, lastError: message }).where(eq(netConnection.id, conn.id));
    if (!(e instanceof SourceError)) console.error("[network] poll failed", e);
    return { ok: false as const, error: message };
  }
}

const g = globalThis as unknown as { netPolling?: Promise<unknown> | null };

/** Polls every enabled connection. Overlapping calls share one run. */
export async function pollAll(now = new Date()) {
  if (g.netPolling) return g.netPolling;
  g.netPolling = (async () => {
    const conns = await db.select().from(netConnection).where(eq(netConnection.enabled, true));
    const results = [];
    for (const c of conns) results.push({ id: c.id, name: c.name, ...(await pollConnection(c, now)) });
    return results;
  })().finally(() => {
    g.netPolling = null;
  });
  return g.netPolling;
}

export { normMac };
