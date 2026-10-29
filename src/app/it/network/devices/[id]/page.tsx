import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { Icon } from "@/components/icons";
import { KIND_LABEL, OnlineChip, sinceText, uptime, UptimeBars } from "@/components/net-bits";
import { deviceDetail } from "@/lib/network/queries";
import { requireIT } from "@/lib/session";

export const metadata = { title: "Network device" };

export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireIT();
  const { id } = await params;
  const r = await deviceDetail(Number(id));
  if (!r) notFound();
  const { d } = r;
  const now = new Date();
  const facts: [string, React.ReactNode][] = [
    ["Type", KIND_LABEL[d.kind]],
    ["Model", d.model],
    [
      "IP address",
      d.ip && (
        <>
          <span className="mono">{d.ip}</span> <CopyButton text={d.ip} />
        </>
      ),
    ],
    ["MAC address", <span key="m" className="mono">{d.mac}</span>],
    ["Firmware", d.firmware],
    ["Up for", d.online ? uptime(d.uptimeSec) : null],
    ["Offline since", !d.online && d.downSince ? sinceText(d.downSince, now) : null],
    ["Last seen", !d.online ? sinceText(d.lastSeenAt, now) : null],
    ["Connected to", r.uplink ? <Link key="u" href={`/it/network/devices/${r.uplink.id}`}>{r.uplink.name}</Link> : null],
    ["Inventory", d.assetId ? <Link key="a" href={`/it/assets/${d.assetId}`}>Open item</Link> : null],
  ];
  return (
    <div className="page">
      <div>
        <Link className="btn" href={`/it/network/${r.site.id}`}>
          <Icon name="back" />
          {r.site.name}
        </Link>
      </div>
      <div className="page-head">
        <div>
          <p className="muted">{KIND_LABEL[d.kind]}</p>
          <h1>{d.name}</h1>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <OnlineChip online={d.online} />
          </div>
        </div>
      </div>
      <div className="grid cols-main">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Details</h2>
            </div>
            <div className="panel-body">
              <dl className="kv">
                {facts
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          </section>
          {d.kind !== "gateway" && (
            <section className="panel">
              <div className="panel-head">
                <h2>Connected through it now</h2>
                <span className="muted" style={{ fontSize: ".78rem" }}>{r.clients.length}</span>
              </div>
              <div className="panel-body list">
                {r.clients.length ? (
                  r.clients.map((c) => (
                    <div key={c.id}>
                      <span>
                        {c.name || "Unnamed"} <span className="mono muted">{c.ip}</span>
                      </span>
                      <span className="muted">{c.wired ? "Cable" : "Wi-Fi"}</span>
                    </div>
                  ))
                ) : (
                  <p className="muted">Nothing connected right now.</p>
                )}
              </div>
            </section>
          )}
        </div>
        <aside className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Last 14 days</h2>
            </div>
            <div className="panel-body">
              <UptimeBars days={r.uptime} label={d.name} />
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Outages</h2>
            </div>
            <div className="panel-body list">
              {r.events.length ? (
                r.events.map((e) => (
                  <div key={e.id}>
                    <span className={e.type === "device_down" ? "t-late" : ""}>
                      {e.type === "device_down" ? (e.data.firstSeen ? "Offline when first checked" : "Went offline") : `Back online${typeof e.data.downMs === "number" ? ` after ${uptime(Math.round(e.data.downMs / 1000))}` : ""}`}
                    </span>
                    <span className="muted">{sinceText(e.at, now)}</span>
                  </div>
                ))
              ) : (
                <p className="muted">No outages recorded.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
