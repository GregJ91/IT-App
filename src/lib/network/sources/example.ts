// A made-up network for three sites, so the Network pages can be tried without any UniFi kit.
// Printer MAC addresses match the example inventory, so "on the network" shows for them too.
import type { ClientSnap, DeviceSnap, SiteSnap, Snapshot } from "../types";

const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000);
const dev = (externalId: string, name: string, model: string, kind: DeviceSnap["kind"], mac: string, ip: string, uplinkMac: string | null, online = true, days = 41): DeviceSnap => ({
  externalId, name, model, kind, mac, ip, firmware: kind === "gateway" ? "4.1.13" : kind === "ap" ? "6.6.77" : "7.1.26", online, uptimeSec: online ? days * 86400 + 3600 : null, uplinkMac,
});
const client = (name: string, mac: string, ip: string, wired: boolean, uplinkMac: string, minAgo = 240): ClientSnap => ({ name, mac, ip, wired, uplinkMac, connectedAt: at(minAgo) });

function laptops(prefix: string, n: number, net: string, aps: string[]): ClientSnap[] {
  return Array.from({ length: n }, (_, i) => client(`${prefix}-LT-${String(i + 1).padStart(2, "0")}`, `A4:83:E7:${prefix.length.toString(16).padStart(2, "0").toUpperCase()}:${(i + 16).toString(16).toUpperCase().padStart(2, "0")}:${(i * 7 + 32).toString(16).toUpperCase().padStart(2, "0")}`, `${net}.${100 + i}`, false, aps[i % aps.length], 30 + i * 11));
}

export function readExample(): Snapshot {
  const ho: SiteSnap = {
    externalId: "example-head-office",
    name: "Head Office",
    wan: { status: "up", isp: "BT Business", latencyMs: 7 },
    devices: [
      dev("ho-gw", "Head Office gateway", "UDM-Pro", "gateway", "74:AC:B9:10:00:01", "10.10.0.1", null),
      dev("ho-sw1", "Comms cupboard switch", "USW-24-PoE", "switch", "74:AC:B9:10:00:02", "10.10.0.2", "74:AC:B9:10:00:01"),
      dev("ho-sw2", "Meeting room switch", "USW-Lite-8-PoE", "switch", "74:AC:B9:10:00:03", "10.10.0.3", "74:AC:B9:10:00:02"),
      dev("ho-ap1", "AP Office", "U6-Pro", "ap", "74:AC:B9:10:00:11", "10.10.0.11", "74:AC:B9:10:00:02"),
      dev("ho-ap2", "AP Meeting rooms", "U6-Lite", "ap", "74:AC:B9:10:00:12", "10.10.0.12", "74:AC:B9:10:00:03"),
      dev("ho-ap3", "AP Kitchen", "U6-Lite", "ap", "74:AC:B9:10:00:13", "10.10.0.13", "74:AC:B9:10:00:02"),
    ],
    clients: [
      client("Accounts MFP", "00:26:73:5C:01:9F", "10.10.1.20", true, "74:AC:B9:10:00:02", 9000),
      client("Reception printer", "3C:2A:F4:88:20:6E", "10.10.1.22", true, "74:AC:B9:10:00:02", 9000),
      ...laptops("HO", 22, "10.10.2", ["74:AC:B9:10:00:11", "74:AC:B9:10:00:12", "74:AC:B9:10:00:13"]),
    ],
    clientCount: null,
  };
  const wh: SiteSnap = {
    externalId: "example-warehouse",
    name: "Warehouse",
    wan: { status: "up", isp: "Virgin Media Business", latencyMs: 11 },
    devices: [
      dev("wh-gw", "Warehouse gateway", "UCG-Ultra", "gateway", "74:AC:B9:20:00:01", "10.20.0.1", null, true, 12),
      dev("wh-sw1", "Dispatch switch", "USW-16-PoE", "switch", "74:AC:B9:20:00:02", "10.20.0.2", "74:AC:B9:20:00:01", true, 12),
      dev("wh-ap1", "AP Dispatch", "U6-Mesh", "ap", "74:AC:B9:20:00:11", "10.20.0.11", "74:AC:B9:20:00:02", true, 12),
      dev("wh-ap2", "AP Goods in", "U6-Mesh", "ap", "74:AC:B9:20:00:12", "10.20.0.12", "74:AC:B9:20:00:02", true, 12),
      dev("wh-ap3", "AP Yard", "U6-Mesh", "ap", "74:AC:B9:20:00:13", "10.20.0.13", "74:AC:B9:20:00:11", true, 3),
    ],
    clients: [
      client("NPI1A7F04 (HP LaserJet M507)", "3C:52:82:1A:7F:04", "10.20.1.31", true, "74:AC:B9:20:00:02", 9000),
      client("fi-8170", "00:80:92:41:0C:55", "10.20.1.60", true, "74:AC:B9:20:00:02", 9000),
      client("Handheld scanner 1", "00:17:23:AA:10:01", "10.20.3.51", false, "74:AC:B9:20:00:11", 70),
      client("Handheld scanner 2", "00:17:23:AA:10:02", "10.20.3.52", false, "74:AC:B9:20:00:12", 55),
      ...laptops("WH", 9, "10.20.2", ["74:AC:B9:20:00:11", "74:AC:B9:20:00:12"]),
    ],
    clientCount: null,
  };
  const sr: SiteSnap = {
    externalId: "example-showroom",
    name: "Showroom",
    wan: { status: "up", isp: "BT Business", latencyMs: 48 },
    devices: [
      dev("sr-gw", "Showroom gateway", "UCG-Ultra", "gateway", "74:AC:B9:30:00:01", "10.30.0.1", null, true, 3),
      dev("sr-sw1", "Back office switch", "USW-Lite-8-PoE", "switch", "74:AC:B9:30:00:02", "10.30.0.2", "74:AC:B9:30:00:01", true, 3),
      dev("sr-ap1", "AP Shop floor", "U6-Lite", "ap", "74:AC:B9:30:00:11", "10.30.0.11", "74:AC:B9:30:00:02", true, 3),
      dev("sr-ap2", "AP Back office", "U6-Lite", "ap", "74:AC:B9:30:00:12", "10.30.0.12", "74:AC:B9:30:00:02", false),
    ],
    clients: [
      client("Showroom wall display", "B8:27:EB:4C:91:0A", "10.30.1.50", true, "74:AC:B9:30:00:02", 4000),
      client("Till 1", "00:0B:AB:61:21:01", "10.30.1.61", true, "74:AC:B9:30:00:02", 4000),
      ...laptops("SR", 4, "10.30.2", ["74:AC:B9:30:00:11"]),
    ],
    clientCount: null,
  };
  return { sites: [ho, wh, sr] };
}
