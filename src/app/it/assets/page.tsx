import Link from "next/link";
import { AssetStatusChip, AssetThumb } from "@/components/asset-bits";
import { Icon } from "@/components/icons";
import { assetTypes, listAssets } from "@/lib/assets";
import { requireIT } from "@/lib/session";
import { getLookups } from "@/lib/tickets";

export const metadata = { title: "Inventory" };

export default async function Assets({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireIT();
  const sp = await searchParams;
  const typeId = Number(sp.type) || null;
  const siteId = Number(sp.site) || null;
  const status = sp.status ?? null;
  const [list, types, { sites }] = await Promise.all([
    listAssets({ q: sp.q, typeId, siteId, status, includeRetired: status === "retired" }),
    assetTypes(),
    getLookups(),
  ]);
  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const all = { type: sp.type ?? null, site: sp.site ?? null, status: sp.status ?? null, q: sp.q ?? null, ...patch };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Inventory</h1>
          <p className="sub">Laptops, printers, scanners, Raspberry Pis and everything else with a tag</p>
        </div>
        <div className="actions">
          <Link className="btn" href="/it/import">
            <Icon name="upload" />
            Import
          </Link>
          <Link className="btn" href={`/it/labels?assets=${list.map((a) => a.id).join(",")}`}>
            <Icon name="qr" />
            Print labels
          </Link>
          <Link className="btn primary" href="/it/assets/new">
            <Icon name="plus" />
            Add item
          </Link>
        </div>
      </div>
      <section className="panel">
        <div className="toolbar">
          <nav className="tabs" aria-label="Types">
            <Link className="tab" href={`/it/assets${qs({ type: null })}`} {...(!typeId ? { "aria-current": "page" as const } : {})}>
              All
            </Link>
            {types.map((t) => (
              <Link key={t.id} className="tab" href={`/it/assets${qs({ type: String(t.id) })}`} {...(typeId === t.id ? { "aria-current": "page" as const } : {})}>
                {t.name}
              </Link>
            ))}
          </nav>
        </div>
        <form className="toolbar" action="/it/assets">
          {typeId && <input type="hidden" name="type" value={typeId} />}
          <label className="search" htmlFor="aq">
            <Icon name="search" />
            <input id="aq" name="q" defaultValue={sp.q} placeholder="Tag, name, serial, IP, person or place" />
          </label>
          <select className="filter" name="site" defaultValue={siteId ?? ""} aria-label="Site">
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="filter" name="status" defaultValue={status ?? ""} aria-label="Status">
            <option value="">Not retired</option>
            <option value="in_use">In use</option>
            <option value="spare">Spare</option>
            <option value="repair">In repair</option>
            <option value="retired">Retired</option>
          </select>
          <button className="btn">Filter</button>
        </form>
        {list.length ? (
          <div className="rows">
            {list.map((a) => (
              <Link key={a.id} className="row asset-row" href={`/it/assets/${a.id}`}>
                <AssetThumb photoId={a.photoId} typeName={a.typeName} />
                <span className="rid mono muted">{a.tag}</span>
                <span className="main" style={{ minWidth: 0 }}>
                  <div className="title">{a.name}</div>
                  <div className="meta">
                    {[a.typeName, [a.make, a.model].filter(Boolean).join(" "), a.serial && `S/N ${a.serial}`].filter(Boolean).join(" · ")}
                  </div>
                </span>
                <span className="status">
                  <AssetStatusChip status={a.status} />
                </span>
                <span className="meta where" style={{ minWidth: 0 }}>
                  {[...new Set([a.assignedTo, a.siteName, a.location].filter(Boolean))].join(" · ") || "—"}
                </span>
                <span className="sla">{a.openTickets > 0 ? <span className="t-soon">{a.openTickets} open job{a.openTickets > 1 ? "s" : ""}</span> : <span className="muted mono">{a.ipAddress}</span>}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">
            <p>{sp.q || typeId || siteId || status ? "Nothing matches these filters." : "Nothing in the inventory yet."}</p>
            <div className="actions">
              <Link className="btn primary" href="/it/assets/new">
                Add the first item
              </Link>
              <Link className="btn" href="/it/import">
                Import a spreadsheet
              </Link>
            </div>
          </div>
        )}
      </section>
      <p className="muted" style={{ fontSize: ".8rem" }}>
        {list.length} item{list.length === 1 ? "" : "s"} shown. Retired kit is hidden unless you filter for it.
      </p>
    </div>
  );
}
