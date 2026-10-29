// A stand-in UniFi: the console's local Network API (/proxy/network/integration/v1/…)
// and the Site Manager cloud API (/v1/…). State can be changed during a test.
import { createServer } from "node:http";

export const FAKE_UNIFI_KEY = "unifi-test-key";

export type FakeDevice = { id: string; name: string; model: string; mac: string; ip: string; state: "ONLINE" | "OFFLINE"; uplinkId?: string; firmware?: string; uptimeSec?: number; features?: string[] };
export type FakeClient = { name: string; mac: string; ip: string; type: "WIRED" | "WIRELESS"; uplinkId: string };
export type FakeSite = { id: string; name: string; devices: FakeDevice[]; clients: FakeClient[]; isp?: string; latency?: number; hostId?: string };

export function defaultFakeSites(): FakeSite[] {
  return [
    {
      id: "site-wh",
      name: "Warehouse",
      isp: "Virgin Media Business",
      latency: 11,
      hostId: "host-wh",
      devices: [
        { id: "d-gw", name: "Warehouse gateway", model: "UCG-Ultra", mac: "aa:bb:cc:00:00:01", ip: "10.20.0.1", state: "ONLINE", firmware: "4.1.13", uptimeSec: 86400 * 12 },
        { id: "d-sw", name: "Dispatch switch", model: "USW-16-PoE", mac: "aa:bb:cc:00:00:02", ip: "10.20.0.2", state: "ONLINE", uplinkId: "d-gw", features: ["switching"] },
        { id: "d-ap", name: "AP Dispatch", model: "U6-Mesh", mac: "aa:bb:cc:00:00:11", ip: "10.20.0.11", state: "ONLINE", uplinkId: "d-sw", features: ["accessPoint"] },
      ],
      clients: [
        { name: "NPI1A7F04", mac: "3c:52:82:1a:7f:04", ip: "10.20.1.31", type: "WIRED", uplinkId: "d-sw" },
        { name: "Handheld 1", mac: "00:17:23:aa:10:01", ip: "10.20.3.51", type: "WIRELESS", uplinkId: "d-ap" },
      ],
    },
  ];
}

export function startFakeUnifi(port: number) {
  const state = { sites: defaultFakeSites(), requests: 0 };
  const server = createServer((req, res) => {
    state.requests++;
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.headers["x-api-key"] !== FAKE_UNIFI_KEY) return send(401, { message: "Unauthorized" });
    const url = new URL(req.url ?? "/", "http://x");
    const page = <T,>(list: T[]) => {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 200);
      return { offset, limit, count: Math.min(limit, Math.max(0, list.length - offset)), totalCount: list.length, data: list.slice(offset, offset + limit) };
    };
    const p = url.pathname.replace(/^\/proxy\/network\/integration\/v1/, "/local");
    let m: RegExpMatchArray | null;
    if (p === "/local/sites") return send(200, page(state.sites.map((s) => ({ id: s.id, name: s.name }))));
    if ((m = p.match(/^\/local\/sites\/([^/]+)\/devices$/))) {
      const s = state.sites.find((x) => x.id === m![1]);
      return s ? send(200, page(s.devices.map((d) => ({ id: d.id, name: d.name, model: d.model, macAddress: d.mac, ipAddress: d.ip, state: d.state, features: d.features ?? [] })))) : send(404, {});
    }
    if ((m = p.match(/^\/local\/sites\/([^/]+)\/devices\/([^/]+)(\/statistics\/latest)?$/))) {
      const d = state.sites.find((x) => x.id === m![1])?.devices.find((x) => x.id === m![2]);
      if (!d) return send(404, {});
      return m[3] ? send(200, { uptimeSec: d.uptimeSec ?? 3600 }) : send(200, { id: d.id, firmwareVersion: d.firmware ?? "7.1.26", uplink: d.uplinkId ? { deviceId: d.uplinkId } : undefined });
    }
    if ((m = p.match(/^\/local\/sites\/([^/]+)\/clients$/))) {
      const s = state.sites.find((x) => x.id === m![1]);
      return s ? send(200, page(s.clients.map((c) => ({ type: c.type, name: c.name, ipAddress: c.ip, macAddress: c.mac, uplinkDeviceId: c.uplinkId, connectedAt: "2026-10-29T08:00:00Z" })))) : send(404, {});
    }
    // Cloud (Site Manager).
    if (p === "/v1/sites") {
      return send(200, {
        data: state.sites.map((s) => ({
          siteId: s.id,
          hostId: s.hostId ?? s.id,
          meta: { name: "default", desc: s.name },
          statistics: {
            counts: { totalDevice: s.devices.length, offlineDevice: s.devices.filter((d) => d.state === "OFFLINE").length, wifiClient: s.clients.filter((c) => c.type === "WIRELESS").length, wiredClient: s.clients.filter((c) => c.type === "WIRED").length, offlineGatewayDevice: s.devices.filter((d) => /UCG|UDM/.test(d.model) && d.state === "OFFLINE").length },
            ispInfo: { name: s.isp },
          },
        })),
      });
    }
    if (p === "/v1/devices") {
      return send(200, {
        data: state.sites.map((s) => ({
          hostId: s.hostId ?? s.id,
          devices: s.devices.map((d) => ({ id: d.id, mac: d.mac.replace(/:/g, ""), name: d.name, model: d.model, shortname: d.model, ip: d.ip, status: d.state.toLowerCase(), version: d.firmware ?? "7.1.26", isConsole: /UCG|UDM/.test(d.model) })),
        })),
      });
    }
    if (p.startsWith("/ea/isp-metrics/")) {
      return send(200, { data: state.sites.map((s) => ({ siteId: s.id, periods: [{ data: { wan: { avgLatency: s.latency } } }] })) });
    }
    send(404, { message: "not found" });
  });
  return new Promise<{ state: typeof state; close: () => Promise<void> }>((resolve) =>
    server.listen(port, () => resolve({ state, close: () => new Promise((r) => server.close(() => r())) })),
  );
}
