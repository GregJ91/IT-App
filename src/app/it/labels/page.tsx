import { inArray } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { Icon } from "@/components/icons";
import { Qr } from "@/components/qr";
import { config } from "@/lib/config";
import { requireIT } from "@/lib/session";
import { PrintButton } from "./print-button";

export const metadata = { title: "Print labels" };

// Common UK label stock. A4 sheet = Avery L7160 / J8160 (21 per sheet, 63.5 × 38.1 mm).
const SIZES = {
  a4: { label: "A4 sheet, 21 labels (Avery L7160)", page: "A4", w: 63.5, h: 38.1 },
  brother: { label: "Single 62 × 29 mm (Brother QL, DK-11209)", page: "62mm 29mm", w: 62, h: 29 },
  zebra: { label: "Single 57 × 32 mm (Zebra)", page: "57mm 32mm", w: 57, h: 32 },
} as const;
type Size = keyof typeof SIZES;

const ids = (v?: string) => (v ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);

export default async function Labels({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireIT();
  const sp = await searchParams;
  const size: Size = sp.size && sp.size in SIZES ? (sp.size as Size) : "a4";
  const s = SIZES[size];
  const assetIds = ids(sp.assets);
  const stockIds = ids(sp.stock);
  const [assets, stock, sites] = await Promise.all([
    assetIds.length ? db.select().from(schema.asset).where(inArray(schema.asset.id, assetIds)) : [],
    stockIds.length ? db.select().from(schema.stockItem).where(inArray(schema.stockItem.id, stockIds)) : [],
    db.select().from(schema.site),
  ]);
  const siteName = new Map(sites.map((x) => [x.id, x.name]));
  const labels = [
    ...assets.sort((a, b) => a.tag.localeCompare(b.tag)).map((a) => ({ key: `a${a.id}`, code: a.tag, name: a.name, where: a.siteId ? siteName.get(a.siteId) : "", url: `${config.appUrl}/a/${a.tag}` })),
    ...stock.sort((a, b) => a.code.localeCompare(b.code)).map((i) => ({ key: `s${i.id}`, code: i.code, name: i.name, where: i.location, url: `${config.appUrl}/s/${i.code}` })),
  ];
  const keep = new URLSearchParams();
  if (sp.assets) keep.set("assets", sp.assets);
  if (sp.stock) keep.set("stock", sp.stock);

  return (
    <div className="page">
      {/* Page size for the printer; the labels below are drawn in millimetres. */}
      <style>{`
        @page { size: ${s.page}; margin: ${size === "a4" ? "15.1mm 7.2mm" : "0"}; }
        .qr-label { width: ${s.w}mm; height: ${s.h}mm; }
        .sheet { grid-template-columns: repeat(${size === "a4" ? 3 : 1}, ${s.w}mm); column-gap: ${size === "a4" ? "2.5mm" : "0"}; }
        ${size === "a4" ? "" : "@media print { .qr-label { break-after: page; } }"}
      `}</style>
      <div className="page-head no-print">
        <div>
          <h1>Print labels</h1>
          <p className="sub">
            {labels.length} label{labels.length === 1 ? "" : "s"}. Scanning one with any phone camera opens the item in IT Hub.
          </p>
        </div>
        <div className="actions">
          <nav className="tabs" aria-label="Label size">
            {(Object.keys(SIZES) as Size[]).map((k) => (
              <Link key={k} className="tab" href={`/it/labels?${keep.toString()}&size=${k}`} {...(k === size ? { "aria-current": "page" as const } : {})}>
                {SIZES[k].label}
              </Link>
            ))}
          </nav>
          {labels.length > 0 && <PrintButton />}
        </div>
      </div>
      {labels.length === 0 ? (
        <div className="panel empty no-print">
          <p>No labels picked. Open an item or the stock list and choose Print label.</p>
          <Link className="btn" href="/it/assets">
            <Icon name="box" />
            Inventory
          </Link>
        </div>
      ) : (
        <div className="sheet">
          {labels.map((l) => (
            <div key={l.key} className="qr-label">
              <Qr value={l.url} label={`QR code for ${l.code}`} />
              <div className="label-text">
                <strong className="mono">{l.code}</strong>
                <span className="label-name">{l.name}</span>
                <span className="label-org">Gardeners Dream IT{l.where ? ` · ${l.where}` : ""}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
