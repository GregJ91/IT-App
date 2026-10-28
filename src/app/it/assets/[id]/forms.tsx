"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { FilePicker } from "@/components/file-picker";
import { addPhotosAction, checkInAction, checkOutAction, type AssetFormState } from "../actions";

function Msg({ s }: { s: AssetFormState }) {
  if (!s) return null;
  return s.error ? <p className="error">{s.error}</p> : s.ok ? <p className="success">{s.ok}</p> : null;
}

export function CheckOutForm({ id, people }: { id: number; people: { id: string; name: string; email: string }[] }) {
  const [state, action, pending] = useActionState<AssetFormState, FormData>(checkOutAction, undefined);
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      setOpen(false);
    }
  }, [state]);
  if (!open)
    return (
      <>
        {state?.error && <p className="error">{state.error}</p>}
        <button type="button" className="btn primary" onClick={() => setOpen(true)}>
          Check out to someone
        </button>
      </>
    );
  return (
    <form ref={form} action={action} className="form" style={{ gap: 10 }}>
      <input type="hidden" name="id" value={id} />
      <Msg s={state} />
      <div className="field">
        <label htmlFor="co-user">Person</label>
        <select id="co-user" name="userId" defaultValue="">
          <option value="">Not a person (type below)</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="co-name">Or a place or team</label>
        <input className="input" id="co-name" name="toName" placeholder="e.g. Dispatch, Showroom TV" />
      </div>
      <input className="input" name="note" placeholder="Note (optional), e.g. with charger" aria-label="Note" />
      <div className="actions">
        <button className="btn primary" disabled={pending}>
          Check out
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CheckInForm({ id, sites, siteId }: { id: number; sites: { id: number; name: string }[]; siteId: number | null }) {
  const [state, action, pending] = useActionState<AssetFormState, FormData>(checkInAction, undefined);
  return (
    <form action={action} className="form" style={{ gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <input type="hidden" name="id" value={id} />
      <Msg s={state} />
      <div className="two">
        <select name="siteId" defaultValue={siteId ?? ""} aria-label="Back to site">
          <option value="">Same site</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input className="input" name="location" placeholder="e.g. IT cupboard" aria-label="Back to location" />
      </div>
      <input className="input" name="note" placeholder="Note (optional), e.g. wiped" aria-label="Check-in note" />
      <button className="btn" disabled={pending}>
        Check back in
      </button>
    </form>
  );
}

export function PhotoForm({ id }: { id: number }) {
  const [state, action, pending] = useActionState<AssetFormState, FormData>(addPhotosAction, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="id" value={id} />
      <Msg s={state} />
      <FilePicker resetKey={state} />
      <div className="actions">
        <button className="btn" disabled={pending}>
          {pending ? "Uploading…" : "Save photos"}
        </button>
      </div>
    </form>
  );
}
