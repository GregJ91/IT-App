// What every UniFi source is translated into, so the rest of the app doesn't care where data came from.

export type DeviceKind = "gateway" | "switch" | "ap" | "other";

export type DeviceSnap = {
  externalId: string;
  mac: string;
  name: string;
  model: string;
  kind: DeviceKind;
  ip: string;
  firmware: string;
  online: boolean;
  uptimeSec: number | null;
  /** MAC of the device it's plugged into or meshed to, when known. */
  uplinkMac: string | null;
};

export type ClientSnap = {
  mac: string;
  name: string;
  ip: string;
  wired: boolean;
  uplinkMac: string | null;
  connectedAt: Date | null;
};

export type SiteSnap = {
  externalId: string;
  name: string;
  wan: { status: "up" | "down" | "unknown"; isp: string | null; latencyMs: number | null };
  devices: DeviceSnap[];
  /** null when the source can only give a count (UniFi cloud). */
  clients: ClientSnap[] | null;
  clientCount: number | null;
};

export type Snapshot = { sites: SiteSnap[] };

export type ConnectionConfig = { kind: "console" | "cloud" | "example"; url: string; apiKey: string; trustCert: boolean };

export class SourceError extends Error {}

export function normMac(mac: string | null | undefined) {
  const hex = (mac ?? "").replace(/[^0-9a-f]/gi, "");
  return hex.length === 12 ? hex.toUpperCase().match(/../g)!.join(":") : (mac ?? "").toUpperCase();
}
