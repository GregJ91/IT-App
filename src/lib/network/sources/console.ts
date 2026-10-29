// On-site UniFi console (UDM, Cloud Gateway, Cloud Key or self-hosted Network app 9+),
// using UniFi's official local "Network API" with an API key (Settings → Control Plane → Integrations).
import { getJson } from "../http";
import { normMac, SourceError, type ClientSnap, type ConnectionConfig, type DeviceKind, type DeviceSnap, type Snapshot } from "../types";

type Page<T> = { data?: T[]; totalCount?: number; count?: number; offset?: number; limit?: number };
type ApiSite = { id: string; name?: string; internalReference?: string };
type ApiDevice = { id: string; name?: string; model?: string; macAddress?: string; ipAddress?: string; state?: string; features?: unknown };
type ApiDeviceDetail = ApiDevice & { firmwareVersion?: string; uplink?: { deviceId?: string } };
type ApiStats = { uptimeSec?: number };
type ApiClient = { type?: string; name?: string; ipAddress?: string; macAddress?: string; connectedAt?: string; uplinkDeviceId?: string };

export function apiBase(url: string) {
  const u = url.trim().replace(/\/+$/, "");
  if (!u) throw new SourceError("Add the console's address, e.g. https://192.168.1.1");
  return /\/integration\/v1$/.test(u) ? u : `${u}/proxy/network/integration/v1`;
}

const GATEWAY_MODELS = /^(UDM|UDR|UCG|UXG|USG|UDW|UX|EFG|UCK-?G2-?PLUS)/i;

export function deviceKind(d: Pick<ApiDevice, "model" | "features">): DeviceKind {
  const f = JSON.stringify(d.features ?? "").toLowerCase();
  if (GATEWAY_MODELS.test(d.model ?? "") || f.includes("gateway")) return "gateway";
  if (f.includes("accesspoint") || /^(U6|U7|UAP|UAL|UAPL|E7)/i.test(d.model ?? "")) return "ap";
  if (f.includes("switching") || /^(USW|US-|USL|USM)/i.test(d.model ?? "")) return "switch";
  return "other";
}

export async function readConsole(cfg: ConnectionConfig): Promise<Snapshot> {
  if (!cfg.apiKey) throw new SourceError("Add the console's API key.");
  const base = apiBase(cfg.url);
  const get = <T>(path: string) => getJson<T>(`${base}${path}`, { "X-API-KEY": cfg.apiKey }, { trustCert: cfg.trustCert });
  async function all<T>(path: string) {
    const out: T[] = [];
    for (let offset = 0; offset < 5000; ) {
      const page = await get<Page<T>>(`${path}${path.includes("?") ? "&" : "?"}offset=${offset}&limit=200`);
      const data = page.data ?? [];
      out.push(...data);
      offset += data.length;
      if (data.length === 0 || offset >= (page.totalCount ?? offset)) break;
    }
    return out;
  }

  const sites = await all<ApiSite>("/sites");
  const result: Snapshot = { sites: [] };
  for (const s of sites) {
    const sid = encodeURIComponent(s.id);
    const list = await all<ApiDevice>(`/sites/${sid}/devices`);
    const byId = new Map(list.map((d) => [d.id, d]));
    const devices: DeviceSnap[] = [];
    for (const d of list) {
      // Details and uptime are separate calls; a failure there shouldn't hide the device.
      const [detail, stats] = await Promise.all([
        get<ApiDeviceDetail>(`/sites/${sid}/devices/${encodeURIComponent(d.id)}`).catch(() => null),
        get<ApiStats>(`/sites/${sid}/devices/${encodeURIComponent(d.id)}/statistics/latest`).catch(() => null),
      ]);
      const uplink = detail?.uplink?.deviceId ? byId.get(detail.uplink.deviceId) : undefined;
      devices.push({
        externalId: d.id,
        mac: normMac(d.macAddress),
        name: d.name || d.model || "UniFi device",
        model: d.model ?? "",
        kind: deviceKind(d),
        ip: d.ipAddress ?? "",
        firmware: detail?.firmwareVersion ?? "",
        online: (d.state ?? "").toUpperCase() === "ONLINE",
        uptimeSec: typeof stats?.uptimeSec === "number" ? stats.uptimeSec : null,
        uplinkMac: uplink ? normMac(uplink.macAddress) : null,
      });
    }
    const macOf = new Map(list.map((d) => [d.id, normMac(d.macAddress)]));
    const raw = await all<ApiClient>(`/sites/${sid}/clients`).catch(() => null);
    const clients: ClientSnap[] | null = raw
      ? raw
          .filter((c) => c.macAddress)
          .map((c) => ({
            mac: normMac(c.macAddress),
            name: c.name ?? "",
            ip: c.ipAddress ?? "",
            wired: (c.type ?? "").toUpperCase() === "WIRED",
            uplinkMac: c.uplinkDeviceId ? (macOf.get(c.uplinkDeviceId) ?? null) : null,
            connectedAt: c.connectedAt ? new Date(c.connectedAt) : null,
          }))
      : null;
    // The local API doesn't report the internet line itself; an offline gateway is the best signal it gives.
    const gw = devices.find((d) => d.kind === "gateway");
    result.sites.push({
      externalId: s.id,
      name: s.name || s.internalReference || "Site",
      wan: { status: gw && !gw.online ? "down" : "unknown", isp: null, latencyMs: null },
      devices,
      clients,
      clientCount: clients?.length ?? null,
    });
  }
  return result;
}
