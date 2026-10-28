"use client";
import { useActionState, useState } from "react";
import { moveStockAction, saveStockItem, type StockState } from "./actions";

/** One-tap −1 / +1 buttons for the stock list. */
export function QuickMove({ id, quantity, name }: { id: number; quantity: number; name: string }) {
  const [state, action, pending] = useActionState<StockState, FormData>(moveStockAction, undefined);
  return (
    <form action={action} className="quick-move">
      <input type="hidden" name="id" value={id} />
      <button className="btn small" name="kind" value="taken" disabled={pending || quantity === 0} aria-label={`Take one ${name}`} title="Take one">
        −1
      </button>
      <span className="num qty" aria-live="polite">
        {quantity}
      </span>
      <button className="btn small" name="kind" value="received" disabled={pending} aria-label={`Add one ${name}`} title="Add one">
        +1
      </button>
      {state?.error && <span className="error" style={{ padding: "2px 6px" }}>{state.error}</span>}
    </form>
  );
}

/** Bigger controls for the item page, for use at the cupboard on a phone. */
export function MoveForm({ id, quantity }: { id: number; quantity: number }) {
  const [state, action, pending] = useActionState<StockState, FormData>(moveStockAction, undefined);
  const [kind, setKind] = useState("taken");
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <input type="hidden" name="id" value={id} />
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="success">Done. {state.ok}.</p>}
      <div className="two">
        <button className="btn primary block" name="kind" value="taken" disabled={pending || quantity === 0}>
          Take one
        </button>
        <button className="btn block" name="kind" value="received" disabled={pending}>
          Add one
        </button>
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>More: several, a delivery, or a stock count</summary>
        <div className="form" style={{ gap: 10, marginTop: 10 }}>
          <div className="two">
            <div className="field">
              <label htmlFor="mv-n">How many</label>
              <input className="input" id="mv-n" name="n" type="number" min={0} step={1} inputMode="numeric" />
            </div>
            <div className="field">
              <label htmlFor="mv-kind">What happened</label>
              <select id="mv-kind" defaultValue="taken" onChange={(e) => setKind(e.currentTarget.value)}>
                <option value="taken">Taken out</option>
                <option value="received">Delivery arrived</option>
                <option value="counted">Counted the shelf (set exact number)</option>
              </select>
            </div>
          </div>
          <div className="two">
            <input className="input" name="ticket" placeholder="For job (optional), e.g. IT-1043" aria-label="For job" />
            <input className="input" name="note" placeholder="Note (optional)" aria-label="Note" />
          </div>
          <button className="btn" name="kind" value={kind} disabled={pending}>
            Save
          </button>
        </div>
      </details>
    </form>
  );
}

type Opt = { id: number; name: string };
type Values = { id?: number; name?: string; category?: string; siteId?: number | null; location?: string; minQuantity?: number; supplier?: string; fits?: string; notes?: string };

export function StockForm({ sites, categories, values = {} }: { sites: Opt[]; categories: string[]; values?: Values }) {
  const [state, action, pending] = useActionState<StockState, FormData>(saveStockItem, undefined);
  const editing = !!values.id;
  return (
    <form action={action} className="form">
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="success">{state.ok}</p>}
      {editing && <input type="hidden" name="id" value={values.id} />}
      <div className="two">
        <div className="field">
          <label htmlFor="s-name">Name</label>
          <input className="input" id="s-name" name="name" required defaultValue={values.name} placeholder="e.g. HP 59A toner" />
        </div>
        <div className="field">
          <label htmlFor="s-cat">Category</label>
          <input className="input" id="s-cat" name="category" list="stock-cats" defaultValue={values.category} placeholder="Toner, Peripherals, Cables…" />
          <datalist id="stock-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="two">
        {!editing && (
          <div className="field">
            <label htmlFor="s-qty">How many now</label>
            <input className="input" id="s-qty" name="quantity" type="number" min={0} step={1} defaultValue={0} inputMode="numeric" />
          </div>
        )}
        <div className="field">
          <label htmlFor="s-min">Alert when fewer than</label>
          <input className="input" id="s-min" name="minQuantity" type="number" min={0} step={1} defaultValue={values.minQuantity ?? 0} inputMode="numeric" />
          <span className="hint">0 means never alert.</span>
        </div>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="s-site">Site</label>
          <select id="s-site" name="siteId" defaultValue={values.siteId ?? ""}>
            <option value="">Choose a site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="s-loc">Kept in</label>
          <input className="input" id="s-loc" name="location" defaultValue={values.location} placeholder="e.g. Cupboard B, shelf 2" />
        </div>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="s-sup">Supplier</label>
          <input className="input" id="s-sup" name="supplier" defaultValue={values.supplier} />
        </div>
        <div className="field">
          <label htmlFor="s-fits">Fits</label>
          <input className="input" id="s-fits" name="fits" defaultValue={values.fits} placeholder="e.g. HP LaserJet M507" />
          <span className="hint">For toner and labels: it then shows on that printer&apos;s page.</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="s-notes">Notes</label>
        <textarea id="s-notes" name="notes" defaultValue={values.notes} style={{ minHeight: 70 }} />
      </div>
      <div className="actions">
        <button className="btn primary" disabled={pending}>
          {editing ? "Save changes" : "Add to stock"}
        </button>
      </div>
    </form>
  );
}
