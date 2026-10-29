import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { Icon } from "@/components/icons";
import { KindIcon, OnlineChip, sinceText, UptimeBars, WanChip } from "@/components/net-bits";
import { siteDetail } from "@/lib/network/queries";
import { requireIT } from "@/lib/session";
import { RefreshButton } from "../refresh-button";

export const metadata = { title: "Site network" };

type Dev = NonNullable<Awaited<ReturnType<typeof siteDetail>>>["devices"][number];

/** Kit in rows by how far it is from the gateway, following each device's uplink. */
function tiers(devices: Dev[]) {
  const byMac = new Map(devices.map((d) => [d.mac, d]));
  const depth = new Map<number, number>();
  const depthOf = (d: Dev, seen = new Set<number>()): number => {
    if (depth.has(d.id)) return depth.get(d.id)!;
    if (seen.has(d.id)) return 0;
    seen.add(d.id);
    const parent = d.uplinkMac ? byMac.get(d.uplinkMac) : undefined;
    const n = parent ? depthOf(parent, seen) + 1 : d.kind === "gateway" ? 0 : 1;
    depth.set(d.id, n);
    return n;
  };
  devices.forEach((d) => depthOf(d));
  const rows: Dev[][] = [];
  for (const d of devices) (rows[depth.get(d.id)!] ??= []).push(d);
  return rows.filter(Boolean);
}

const NAMES: Record<string, [string, string]> = {
  gateway: ["gateway", "gateways"],
  switch: ["switch", "switches"],
  ap: ["Wi-Fi access point", "Wi-Fi access points"],
  other: ["other device", "other devices"],
};
function kitSummary(devices: Dev[]) {
  const counts = devices.reduce<Record<string, number>>((m, x) => ((m[x.kind] = (m[x.kind] ?? 0) + 1), m), {});
  const parts = Object.entries(counts).map(([k, n]) => `${n} ${NAMES[k]?.[n === 1 ? 0 : 1] ?? k}`);
  return parts.length ? `UniFi kit here: ${parts.join(", ")}` : "No UniFi kit reported";
}

export default async function SitePage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; all?: string }> }) {
  await requireIT();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const d = await siteDetail(Number(id));
  if (!d) notFound();
  const s = d.s;
  const now = new Date();
  const name = d.ourSite ?? s.name;
  const byMac = new Map(d.devices.map((x) => [x.mac, x]));
  const clientsOn = (mac: string) => d.clients.filter((c) => c.online && c.uplinkMac === mac).length;
  const q = (sp.q ?? "").trim().toLowerCase();
  const clients = d.clients.filter((c) => (sp.all ? true : c.online) && (!q || [c.name, c.ip, c.mac].some((v) => v.toLowerCase().includes(q))));

  return (
    <div className="page">
      <div>
        <Link className="btn" href="/it/network">
          <Icon name="back" />
          Network
        </Link>
      </div>
      <div className="page-head">
        <div>
          <h1>{name}</h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <WanChip status={s.wanStatus} />
            {s.isp && <span className="chip plain">{s.isp}</span>}
            {s.latencyMs != null && <span className="chip plain">{s.latencyMs} ms</span>}
            <span className="chip plain">{d.conn.name}</span>
          </div>
        </div>
        <RefreshButton />
      </div>

      <div className="grid cols-main">
        <section className="panel">
          <div className="panel-head">
            <h2>Map</h2>
            <span className="muted" style={{ fontSize: ".78rem" }}>Internet → gateway → switches → Wi-Fi</span>
          </div>
          <div className="panel-body topo">
            <div className="tier">
              <span className={`node ${s.wanStatus === "down" ? "down" : ""}`}>
                <Icon name="globe" />
                {s.isp ?? "Internet"}
              </span>
            </div>
            {tiers(d.devices).map((row, i) => (
              <div key={i} className="stack" style={{ gap: 6, alignItems: "center" }}>
                <span className="link" />
                <div className="tier">
                  {row.map((x) => (
                    <Link key={x.id} href={`/it/network/devices/${x.id}`} className={`node ${x.online ? "" : "down"}`} title={x.uplinkMac ? `Connected to ${byMac.get(x.uplinkMac)?.name ?? "unknown"}` : undefined}>
                      <KindIcon kind={x.kind} />
                      <span>
                        {x.name}
                        <small>
                          {x.model}
                          {x.online ? ` · ${clientsOn(x.mac)} connected` : " · offline"}
                        </small>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {d.devices.length === 0 && <p className="muted">No UniFi kit reported for this site.</p>}
          </div>
        </section>
        <aside className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Internet, last 14 days</h2>
            </div>
            <div className="panel-body stack" style={{ gap: 8 }}>
              <UptimeBars days={d.uptime} label="Internet" />
              <p className="muted" style={{ fontSize: ".8rem" }}>
                {d.lost ? `${d.lost} outage${d.lost === 1 ? "" : "s"} in the last 30 days.` : "No outages in the last 30 days."}
                {s.wanStatus === "unknown" && " This connection doesn't report the internet line; UniFi's cloud connection does."}
              </p>
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Kit</h2>
            </div>
            <div className="panel-body list">
              {d.devices.map((x) => (
                <div key={x.id}>
                  <Link href={`/it/network/devices/${x.id}`} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <KindIcon kind={x.kind} /> {x.name}
                  </Link>
                  <OnlineChip online={x.online} />
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Connected devices</h2>
          <span className="muted" style={{ fontSize: ".78rem" }}>{s.clientsListed ? `${d.clients.filter((c) => c.online).length} connected now` : `${s.clientCount ?? 0} connected`}</span>
        </div>
        {s.clientsListed ? (
          <>
            <form className="toolbar" action={`/it/network/${s.id}`}>
              <label className="search" htmlFor="cq">
                <Icon name="search" />
                <input id="cq" name="q" defaultValue={sp.q} placeholder="Name, IP or MAC" />
              </label>
              <label className="actions" style={{ fontSize: ".85rem" }}>
                <input type="checkbox" name="all" value="1" defaultChecked={!!sp.all} /> Include ones seen recently
              </label>
              <button className="btn">Filter</button>
            </form>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>IP address</th>
                    <th>MAC</th>
                    <th>Connected to</th>
                    <th>Since</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id} className={c.online ? "" : "muted"}>
                      <td>
                        {c.name || <span className="muted">Unnamed</span>}
                        {!c.online && <span className="muted"> · last seen {sinceText(c.lastSeenAt, now)}</span>}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {c.ip ? (
                          <>
                            <span className="mono">{c.ip}</span> <CopyButton text={c.ip} />
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="mono muted" style={{ whiteSpace: "nowrap" }}>
                        {c.mac}
                      </td>
                      <td>
                        {c.wired ? "Cable" : "Wi-Fi"}
                        {c.uplinkMac && byMac.get(c.uplinkMac) ? ` · ${byMac.get(c.uplinkMac)!.name}` : ""}
                      </td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {c.online ? sinceText(c.connectedAt, now) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {clients.length === 0 && <p className="panel-body muted">Nothing matches.</p>}
            </div>
          </>
        ) : (
          <p className="panel-body muted">UniFi&apos;s cloud only gives a count of connected devices. Add the site&apos;s console as a connection to see the list.</p>
        )}
      </section>
      <p className="muted" style={{ fontSize: ".8rem" }}>
        {kitSummary(d.devices)}. Uptime figures count outages longer than the alert delay in Settings.
      </p>
    </div>
  );
}
