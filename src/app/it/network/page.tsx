import Link from "next/link";
import { Icon } from "@/components/icons";
import { KindIcon, sinceText, WanChip } from "@/components/net-bits";
import { overview, recentEvents } from "@/lib/network/queries";
import { requireIT } from "@/lib/session";
import { RefreshButton } from "./refresh-button";

export const metadata = { title: "Network" };

const EVENT_TEXT: Record<string, (site: string, device: string | null) => string> = {
  wan_down: (s) => `Internet went down at ${s}`,
  wan_up: (s) => `Internet came back at ${s}`,
  device_down: (s, d) => `${d ?? "A device"} went offline at ${s}`,
  device_up: (s, d) => `${d ?? "A device"} came back at ${s}`,
};

export default async function Network() {
  const u = await requireIT();
  const [o, events] = await Promise.all([overview(), recentEvents(15)]);
  const now = new Date();
  const lastOk = o.connections.map((c) => c.lastOkAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
  const problems = o.connections.filter((c) => c.enabled && c.lastError);

  if (o.connections.length === 0) {
    return (
      <div className="page narrow">
        <div className="page-head">
          <div>
            <h1>Network</h1>
            <p className="sub">Your UniFi kit at every site: internet lines, switches, Wi-Fi and what&apos;s connected</p>
          </div>
        </div>
        <section className="panel empty">
          <Icon name="net" />
          <p>Not connected to UniFi yet.</p>
          {u.role === "admin" ? (
            <>
              <p className="muted" style={{ maxWidth: "52ch" }}>
                Add your UniFi console or UniFi cloud account in Settings. To look around first, add the example network there.
              </p>
              <Link className="btn primary" href="/it/settings#network">
                Set up in Settings
              </Link>
            </>
          ) : (
            <p className="muted">Ask an IT admin to connect UniFi in Settings.</p>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Network</h1>
          <p className="sub">{lastOk ? `Updated ${sinceText(lastOk, now)}` : "Not updated yet"} · from UniFi</p>
        </div>
        <div className="actions">
          <form action="/it/network/clients" className="search" style={{ minWidth: 240 }}>
            <Icon name="search" />
            <input name="q" placeholder="Find a connected device: name, IP or MAC" aria-label="Find a connected device" />
          </form>
          <RefreshButton />
        </div>
      </div>
      {problems.map((c) => (
        <p key={c.id} className="error">
          {c.name}: {c.lastError}
        </p>
      ))}
      <div className="grid net-sites">
        {o.sites.map((s) => (
          <Link key={s.id} href={`/it/network/${s.id}`} className="panel net-card">
            <div className="panel-head">
              <h2>{s.ourSite ?? s.name}</h2>
              <WanChip status={s.wanStatus} stale={s.stale} />
            </div>
            <div className="panel-body stack" style={{ gap: 10 }}>
              <div className="net-stats">
                <div>
                  <span className="label">Kit online</span>
                  <span className={`v num ${s.offline.length ? "t-late" : ""}`}>
                    {s.devicesTotal - s.offline.length}/{s.devicesTotal}
                  </span>
                </div>
                <div>
                  <span className="label">Connected</span>
                  <span className="v num">{s.clientCount ?? "—"}</span>
                </div>
                <div>
                  <span className="label">Latency</span>
                  <span className={`v num ${s.latencyMs != null && s.latencyMs > 40 ? "t-soon" : ""}`}>{s.latencyMs != null ? `${s.latencyMs} ms` : "—"}</span>
                </div>
              </div>
              <p className="muted" style={{ fontSize: ".8rem" }}>
                {[s.isp, s.gateway?.model].filter(Boolean).join(" · ") || s.connName}
              </p>
              {s.offline.length > 0 && (
                <div className="list">
                  {s.offline.map((d) => (
                    <div key={d.id} className="t-late">
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <KindIcon kind={d.kind} /> {d.name}
                      </span>
                      <span>offline {d.downSince ? sinceText(d.downSince, now).replace(" ago", "") : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>Outages</h2>
          <span className="muted" style={{ fontSize: ".78rem" }}>Anything down for more than a few minutes</span>
        </div>
        <div className="panel-body list">
          {events.length ? (
            events.map(({ e, siteName, deviceName }) => (
              <div key={e.id}>
                <span className={e.type.endsWith("_down") ? "t-late" : ""}>
                  {(EVENT_TEXT[e.type] ?? ((s: string) => `${e.type} at ${s}`))(siteName, deviceName)}
                  {e.data.firstSeen ? " (already offline when first checked)" : ""}
                  {typeof e.data.ticketId === "number" && (
                    <>
                      {" · "}
                      <Link href={`/it/tickets/${e.data.ticketId}`}>IT-{String(e.data.ticketId)}</Link>
                    </>
                  )}
                </span>
                <span className="muted">{sinceText(e.at, now)}</span>
              </div>
            ))
          ) : (
            <p className="muted">No outages recorded.</p>
          )}
        </div>
      </section>
    </div>
  );
}
