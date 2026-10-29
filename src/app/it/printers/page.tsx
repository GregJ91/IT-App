import Link from "next/link";
import { AssetStatusChip } from "@/components/asset-bits";
import { CopyButton } from "@/components/copy-button";
import { Icon } from "@/components/icons";
import { listAssets } from "@/lib/assets";
import { requireIT } from "@/lib/session";
import { stockFitting } from "@/lib/stock";
import { connections, presenceFor } from "@/lib/network/queries";
import { OnlineChip } from "@/components/net-bits";

export const metadata = { title: "Printers" };

export default async function Printers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireIT();
  const sp = await searchParams;
  const printers = await listAssets({ printersOnly: true, q: sp.q });
  const [supplies, presence] = await Promise.all([Promise.all(printers.map((p) => stockFitting(p.model))), presenceFor(printers.map((p) => p.macAddress))]);
  const anyNetwork = presence.size > 0 || (await connections()).length > 0;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Printers</h1>
          <p className="sub">Every printer, label printer and scanner, with its address on the network</p>
        </div>
        <div className="actions">
          <form action="/it/printers" className="search" style={{ minWidth: 240 }}>
            <Icon name="search" />
            <input name="q" defaultValue={sp.q} placeholder="Name, model, IP or place" aria-label="Search printers" />
          </form>
          <Link className="btn primary" href="/it/assets/new">
            <Icon name="plus" />
            Add printer
          </Link>
        </div>
      </div>
      <section className="panel">
        {printers.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Printer</th>
                  {anyNetwork && <th>Network</th>}
                  <th>Model</th>
                  <th>IP address</th>
                  <th>MAC</th>
                  <th>Where</th>
                  <th>Supplies</th>
                  <th>Jobs</th>
                </tr>
              </thead>
              <tbody>
                {printers.map((p, n) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/it/assets/${p.id}`} style={{ fontWeight: 600 }}>
                        {p.name}
                      </Link>
                      <div className="muted mono" style={{ fontSize: ".75rem" }}>
                        {p.tag} · {p.typeName}
                      </div>
                      {p.status !== "in_use" && (
                        <div style={{ marginTop: 4 }}>
                          <AssetStatusChip status={p.status} />
                        </div>
                      )}
                    </td>
                    {anyNetwork && (
                      <td>
                        {presence.get(p.macAddress) ? (
                          <OnlineChip online={presence.get(p.macAddress)!.online} />
                        ) : (
                          <span className="muted" title={p.macAddress ? "UniFi hasn't seen this MAC address" : "Add its MAC address to match it"}>
                            {p.macAddress ? "Not seen" : "No MAC"}
                          </span>
                        )}
                      </td>
                    )}
                    <td>{[p.make, p.model].filter(Boolean).join(" ") || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {p.ipAddress ? (
                        <>
                          <a className="mono" href={`http://${p.ipAddress}`} target="_blank" rel="noreferrer" title="Open the printer's own web page (works on the office network)">
                            {p.ipAddress}
                          </a>{" "}
                          <CopyButton text={p.ipAddress} />
                        </>
                      ) : (
                        <span className="muted">Not set</span>
                      )}
                    </td>
                    <td className="mono muted" style={{ whiteSpace: "nowrap" }}>
                      {p.macAddress || "—"}
                    </td>
                    <td>{[p.siteName, p.location].filter(Boolean).join(" · ") || "—"}</td>
                    <td>
                      {supplies[n].length
                        ? supplies[n].map((s) => (
                            <div key={s.id} style={{ whiteSpace: "nowrap" }}>
                              <Link href={`/it/stock/${s.id}`}>{s.name}</Link>{" "}
                              <span className={s.minQuantity > 0 && s.quantity < s.minQuantity ? "t-late" : "muted"}>× {s.quantity}</span>
                            </div>
                          ))
                        : <span className="muted">—</span>}
                    </td>
                    <td>{p.openTickets ? <span className="t-soon">{p.openTickets} open</span> : <span className="muted">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <p>{sp.q ? "No printers match." : "No printers yet. Add one as an inventory item with the type Printer, Label printer or Scanner."}</p>
          </div>
        )}
      </section>
      <p className="muted" style={{ fontSize: ".8rem" }}>
        Clicking an IP address opens the printer&apos;s own web page, which only works on the office network. &ldquo;Network&rdquo; shows whether UniFi can
        see the printer, matched by MAC address. Toner levels read from the printers themselves need the app to be hosted where it can reach them.
      </p>
    </div>
  );
}
