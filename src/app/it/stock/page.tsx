import Link from "next/link";
import { Icon } from "@/components/icons";
import { requireIT } from "@/lib/session";
import { isLow, listStock } from "@/lib/stock";
import { getLookups } from "@/lib/tickets";
import { QuickMove } from "./forms";

export const metadata = { title: "Stock" };

export default async function Stock({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireIT();
  const sp = await searchParams;
  const siteId = Number(sp.site) || null;
  const lowOnly = sp.low === "1";
  const [items, { sites }] = await Promise.all([listStock({ q: sp.q, lowOnly, siteId }), getLookups()]);
  const low = items.filter(isLow).length;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Stock</h1>
          <p className="sub">What&apos;s in the cupboards. Tap −1 when you take something.</p>
        </div>
        <div className="actions">
          <Link className="btn" href="/it/import?kind=stock">
            <Icon name="upload" />
            Import
          </Link>
          <Link className="btn" href={`/it/labels?stock=${items.map((i) => i.id).join(",")}`}>
            <Icon name="qr" />
            Shelf labels
          </Link>
          <Link className="btn primary" href="/it/stock/new">
            <Icon name="plus" />
            Add item
          </Link>
        </div>
      </div>
      <section className="panel">
        <form className="toolbar" action="/it/stock">
          <nav className="tabs" aria-label="Views">
            <Link className="tab" href="/it/stock" {...(!lowOnly ? { "aria-current": "page" as const } : {})}>
              All
            </Link>
            <Link className="tab" href="/it/stock?low=1" {...(lowOnly ? { "aria-current": "page" as const } : {})}>
              Running low{!lowOnly && low ? ` (${low})` : ""}
            </Link>
          </nav>
          {lowOnly && <input type="hidden" name="low" value="1" />}
          <label className="search" htmlFor="sq">
            <Icon name="search" />
            <input id="sq" name="q" defaultValue={sp.q} placeholder="Name, category, what it fits, where it's kept" />
          </label>
          <select className="filter" name="site" defaultValue={siteId ?? ""} aria-label="Site">
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="btn">Filter</button>
        </form>
        {items.length ? (
          <div className="rows">
            {items.map((i) => (
              <div key={i.id} className="row stock-row">
                <span className={`stripe ${isLow(i) ? "bg-p1" : "bg-p4"}`} />
                <Link className="main" href={`/it/stock/${i.id}`} style={{ minWidth: 0, textDecoration: "none" }}>
                  <div className="title">{i.name}</div>
                  <div className="meta">{[i.category, i.fits && `fits ${i.fits}`, [i.siteName, i.location].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</div>
                </Link>
                <span className="status">{isLow(i) ? <span className="chip s-bad">Low, min {i.minQuantity}</span> : i.minQuantity ? <span className="chip s-ok">OK</span> : null}</span>
                <QuickMove id={i.id} quantity={i.quantity} name={i.name} />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <p>{lowOnly ? "Nothing is running low." : "No stock yet."}</p>
            {!lowOnly && (
              <Link className="btn primary" href="/it/stock/new">
                Add the first item
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
