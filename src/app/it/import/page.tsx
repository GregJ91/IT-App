import { requireIT } from "@/lib/session";
import { ImportForm } from "./import-form";

export const metadata = { title: "Import" };

export default async function Import({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireIT();
  const sp = await searchParams;
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Import from a spreadsheet</h1>
          <p className="sub">Bring in kit or stock you already keep in Excel. You&apos;ll see a check of every row before anything is saved.</p>
        </div>
      </div>
      <ImportForm kind={sp.kind === "stock" ? "stock" : "assets"} />
      <section className="panel panel-body stack" style={{ gap: 8 }}>
        <h2>How it works</h2>
        <ol className="muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>Download the template, or use your own sheet with a heading row. Columns are matched by name, so the order doesn&apos;t matter.</li>
          <li>In Excel choose File → Save As → CSV (Comma delimited).</li>
          <li>Upload it and press Check. Fix anything marked, then press Import.</li>
        </ol>
        <p className="muted" style={{ fontSize: ".85rem" }}>
          Kit: rows with a tag that already exists update that item; rows without a tag get the next free one. Dates can be 31/12/2026. Unknown types are
          added for you; sites must already be in Settings.
        </p>
      </section>
    </div>
  );
}
