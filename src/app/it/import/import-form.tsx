"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { runImport, type ImportState } from "./actions";

const COLUMN_NAMES: Record<string, string> = {
  tag: "Tag",
  name: "Name",
  type: "Type",
  make: "Make",
  model: "Model",
  serial: "Serial",
  status: "Status",
  site: "Site",
  location: "Location",
  assignedTo: "Assigned to",
  ip: "IP",
  mac: "MAC",
  purchaseDate: "Purchase date",
  cost: "Cost",
  supplier: "Supplier",
  warranty: "Warranty",
  notes: "Notes",
  category: "Category",
  quantity: "Quantity",
  min: "Minimum",
  fits: "Fits",
};

export function ImportForm({ kind: initial }: { kind: "assets" | "stock" }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(runImport, undefined);
  const [kind, setKind] = useState(initial);
  const r = state?.result;
  const problems = r?.rows.filter((x) => !x.ok).length ?? 0;
  return (
    <form action={action} className="panel panel-body form">
      <div className="tabs" role="group" aria-label="What are you importing?">
        <button type="button" className="tab" aria-pressed={kind === "assets"} onClick={() => setKind("assets")}>
          Kit (tagged items)
        </button>
        <button type="button" className="tab" aria-pressed={kind === "stock"} onClick={() => setKind("stock")}>
          Cupboard stock
        </button>
      </div>
      <input type="hidden" name="kind" value={kind} />
      <div className="field">
        <label htmlFor="imp-file">CSV file</label>
        <input className="input" id="imp-file" name="file" type="file" accept=".csv,text/csv" />
        <span className="hint">
          <a href={`/api/templates/${kind}.csv`}>Download the {kind === "assets" ? "kit" : "stock"} template</a>
        </span>
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Or paste the rows</summary>
        <textarea name="csv" aria-label="CSV rows" defaultValue={state?.csv} placeholder="Name,Type,Serial,…" style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: ".8rem" }} />
      </details>
      {state?.error && <p className="error">{state.error}</p>}
      {r && (
        <div className="stack" style={{ gap: 8 }}>
          {state?.committed ? (
            <p className="success">
              Imported: {r.created} added{r.updated ? `, ${r.updated} updated` : ""}
              {problems ? `. ${problems} row${problems > 1 ? "s were" : " was"} skipped.` : "."}{" "}
              <Link href={kind === "assets" ? "/it/assets" : "/it/stock"}>See them</Link>
            </p>
          ) : (
            <p className={problems ? "error" : "success"}>
              Checked {r.rows.length} rows: {r.created} to add{r.updated ? `, ${r.updated} to update` : ""}
              {problems ? `, ${problems} with problems that will be skipped` : ", no problems"}. Columns found: {r.columns.map((c) => COLUMN_NAMES[c] ?? c).join(", ")}.
            </p>
          )}
          <div className="table-wrap panel" style={{ maxHeight: 360, overflowY: "auto", boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Item</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((x) => (
                  <tr key={x.line}>
                    <td className="num muted">{x.line}</td>
                    <td>{x.label}</td>
                    <td>
                      <span className={`chip ${!x.ok ? "s-bad" : x.action === "update" ? "s-progress" : "s-ok"}`}>{!x.ok ? "Skip" : x.action === "update" ? "Update" : "Add"}</span>
                      {x.problems.map((p) => (
                        <div key={p} className="muted" style={{ fontSize: ".78rem" }}>
                          {p}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="actions">
        <button className="btn" name="go" value="check" disabled={pending}>
          {pending ? "Working…" : "Check"}
        </button>
        {r && !state?.committed && r.created + r.updated > 0 && (
          <button className="btn primary" name="go" value="import" disabled={pending}>
            Import {r.created + r.updated} row{r.created + r.updated === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </form>
  );
}
