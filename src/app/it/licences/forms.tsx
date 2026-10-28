"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveLicenceAction, type LicenceState } from "./actions";

type Values = { id?: number; name?: string; supplier?: string; seats?: number | null; renewsOn?: string | null; costPence?: number | null; notes?: string };

export function LicenceForm({ values = {}, onDone }: { values?: Values; onDone?: () => void }) {
  const [state, action, pending] = useActionState<LicenceState, FormData>(saveLicenceAction, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (!values.id) form.current?.reset();
      onDone?.();
    }
  }, [state, values.id, onDone]);
  return (
    <form ref={form} action={action} className="form" style={{ gap: 10 }}>
      {state?.error && <p className="error">{state.error}</p>}
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="two">
        <input className="input" name="name" required defaultValue={values.name} placeholder="e.g. Microsoft 365 Business Standard" aria-label="Licence name" />
        <input className="input" name="supplier" defaultValue={values.supplier} placeholder="Supplier" aria-label="Supplier" />
      </div>
      <div className="three">
        <label className="field" style={{ gap: 4 }}>
          <span className="hint">Renews on</span>
          <input className="input" name="renewsOn" type="date" defaultValue={values.renewsOn ?? ""} />
        </label>
        <label className="field" style={{ gap: 4 }}>
          <span className="hint">Seats</span>
          <input className="input" name="seats" inputMode="numeric" defaultValue={values.seats ?? ""} />
        </label>
        <label className="field" style={{ gap: 4 }}>
          <span className="hint">Cost per renewal (£)</span>
          <input className="input" name="cost" inputMode="decimal" defaultValue={values.costPence != null ? (values.costPence / 100).toFixed(2) : ""} />
        </label>
      </div>
      <input className="input" name="notes" defaultValue={values.notes} placeholder="Notes, e.g. admin account, renewal contact" aria-label="Notes" />
      <div className="actions">
        <button className="btn primary" disabled={pending}>
          {values.id ? "Save" : "Add licence"}
        </button>
      </div>
    </form>
  );
}

export function EditLicence({ values }: { values: Values }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn small" onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  return (
    <div style={{ width: "100%" }}>
      <LicenceForm values={values} onDone={() => setOpen(false)} />
    </div>
  );
}
