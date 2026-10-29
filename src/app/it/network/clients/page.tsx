import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { Icon } from "@/components/icons";
import { sinceText } from "@/components/net-bits";
import { searchClients } from "@/lib/network/queries";
import { requireIT } from "@/lib/session";

export const metadata = { title: "Find a device" };

export default async function Clients({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireIT();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const rows = q ? await searchClients(q) : [];
  const now = new Date();
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
          <h1>Find a device on the network</h1>
          <p className="sub">Search every site by name, IP address or MAC address</p>
        </div>
      </div>
      <section className="panel">
        <form className="toolbar" action="/it/network/clients">
          <label className="search" htmlFor="nq">
            <Icon name="search" />
            <input id="nq" name="q" defaultValue={q} placeholder="e.g. LaserJet, 10.20.1.31 or 3C:52:82" autoFocus />
          </label>
          <button className="btn primary">Search</button>
        </form>
        {q ? (
          rows.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Status</th>
                    <th>IP address</th>
                    <th>MAC</th>
                    <th>Where</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ c, siteName, netSiteId, via }) => (
                    <tr key={c.id}>
                      <td>{c.name || <span className="muted">Unnamed</span>}</td>
                      <td>
                        {c.online ? <span className="chip s-ok">Connected</span> : <span className="muted">Seen {sinceText(c.lastSeenAt, now)}</span>}
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
                      <td className="mono muted">{c.mac}</td>
                      <td>
                        <Link href={`/it/network/${netSiteId}`}>{siteName}</Link>
                        <span className="muted">
                          {" "}
                          · {c.wired ? "cable" : "Wi-Fi"}
                          {via ? ` via ${via}` : ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="panel-body muted">Nothing on the network matches &ldquo;{q}&rdquo;.</p>
          )
        ) : (
          <p className="panel-body muted">Type part of a name, an IP address or a MAC address.</p>
        )}
      </section>
    </div>
  );
}
