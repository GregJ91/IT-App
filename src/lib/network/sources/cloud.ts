// UniFi Site Manager (the unifi.ui.com cloud), using an API key from unifi.ui.com → API.
// Works from anywhere, but only gives counts of connected devices, not the list.
import { getJson } from "../http";
import { normMac, SourceError, type ConnectionConfig, type DeviceSnap, type Snapshot } from "../types";
import { deviceKind } from "./console";

type Paged<T> = { data?: T[]; nextToken?: string | null };
type CloudSite = {
  siteId: string;
  hostId: string;
  meta?: { name?: string; desc?: string; gatewayMac?: string };
  statistics?: {
    counts?: { totalDevice?: number; offlineDevice?: number; wifiClient?: number; wiredClient?: number; guestClient?: number; offlineGatewayDevice?: number };
    ispInfo?: { name?: string; organization?: string };
    internetIssues?: unknown[];
  };
};
type CloudHostDevices = { hostId: string; hostName?: string; devices?: { id: string; mac?: string; name?: string; model?: string; shortname?: string; ip?: string; status?: string; version?: string; isConsole?: boolean; startupTime?: string | null; productLine?: string }[] };
type IspMetrics = { data?: { siteId?: string; periods?: { metricTime?: string; data?: { wan?: { avgLatency?: number; ispName?: string } } }[] }[] };

export async function readCloud(cfg: ConnectionConfig): Promise<Snapshot> {
  if (!cfg.apiKey) throw new SourceError("Add the Site Manager API key.");
  const base = (cfg.url.trim() || "https://api.ui.com").replace(/\/+$/, "");
  const get = <T>(path: string) => getJson<T>(`${base}${path}`, { "X-API-KEY": cfg.apiKey });
  async function all<T>(path: string) {
    const out: T[] = [];
    let token: string | null | undefined = undefined;
    for (let i = 0; i < 50; i++) {
      const page: Paged<T> = await get<Paged<T>>(`${path}${token ? `${path.includes("?") ? "&" : "?"}nextToken=${encodeURIComponent(token)}` : ""}`);
      out.push(...(page.data ?? []));
      token = page.nextToken;
      if (!token) break;
    }
    return out;
  }

  const [sites, hosts] = await Promise.all([all<CloudSite>("/v1/sites"), all<CloudHostDevices>("/v1/devices")]);
  // Latency is "early access" in UniFi's API, so it's optional.
  const latency = new Map<string, number>();
  try {
    const m = await get<IspMetrics>("/ea/isp-metrics/5m?duration=24h");
    for (const s of m.data ?? []) {
      const last = (s.periods ?? []).filter((p) => p.data?.wan?.avgLatency != null).at(-1);
      if (s.siteId && last) latency.set(s.siteId, Math.round(last.data!.wan!.avgLatency!));
    }
  } catch {
    /* not available on every account */
  }

  const firstSiteOfHost = new Map<string, string>();
  for (const s of sites) if (!firstSiteOfHost.has(s.hostId)) firstSiteOfHost.set(s.hostId, s.siteId);

  return {
    sites: sites.map((s) => {
      // Devices are grouped by console; a console with several sites shows its kit under the first.
      const devices: DeviceSnap[] =
        firstSiteOfHost.get(s.hostId) === s.siteId
          ? (hosts.find((h) => h.hostId === s.hostId)?.devices ?? []).map((d) => ({
              externalId: d.id,
              mac: normMac(d.mac),
              name: d.name || d.shortname || d.model || "UniFi device",
              model: d.shortname || d.model || "",
              kind: d.isConsole ? "gateway" : deviceKind({ model: d.shortname || d.model }),
              ip: d.ip ?? "",
              firmware: d.version ?? "",
              online: (d.status ?? "").toLowerCase() === "online",
              uptimeSec: d.startupTime ? Math.max(0, Math.round((Date.now() - Date.parse(d.startupTime)) / 1000)) : null,
              uplinkMac: null,
            }))
          : [];
      const c = s.statistics?.counts ?? {};
      const gatewayDown = (c.offlineGatewayDevice ?? 0) > 0 || devices.some((d) => d.kind === "gateway" && !d.online);
      return {
        externalId: s.siteId,
        name: s.meta?.desc || s.meta?.name || "Site",
        wan: {
          status: gatewayDown ? "down" : "up",
          isp: s.statistics?.ispInfo?.name || s.statistics?.ispInfo?.organization || null,
          latencyMs: latency.get(s.siteId) ?? null,
        },
        devices,
        clients: null,
        clientCount: (c.wifiClient ?? 0) + (c.wiredClient ?? 0) + (c.guestClient ?? 0),
      };
    }),
  };
}
