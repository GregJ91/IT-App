"use client";
import { useActionState, useState } from "react";
import { Icon } from "@/components/icons";
import { addTaskAction, createChangeAction, removeTaskAction, toggleTaskAction, updateChangeAction, type PeopleState } from "./actions";

type Opt = { id: number; name: string };
type Spare = { id: number; tag: string; name: string; typeName: string | null; siteName: string | null };
type Person = { id: string; name: string; email: string };
type Values = { id?: number; name: string; email: string; jobTitle: string; siteId: number | null; manager: string; date: string; notes: string };

function Msg({ s }: { s: PeopleState }) {
  if (!s) return null;
  return s.error ? <p className="error">{s.error}</p> : s.ok ? <p className="success">{s.ok}</p> : null;
}

function Details({ kind, sites, v }: { kind: "starter" | "leaver"; sites: Opt[]; v?: Values }) {
  return (
    <>
      <div className="two">
        <div className="field">
          <label htmlFor="p-name">Name</label>
          <input className="input" id="p-name" name="name" required maxLength={120} defaultValue={v?.name} />
        </div>
        <div className="field">
          <label htmlFor="p-email">Work email</label>
          <input className="input" id="p-email" name="email" type="email" maxLength={200} defaultValue={v?.email} placeholder="name@gardenersdream.co.uk" />
        </div>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="p-date">{kind === "starter" ? "First day" : "Last day"}</label>
          <input className="input" id="p-date" name="date" type="date" required defaultValue={v?.date} />
        </div>
        <div className="field">
          <label htmlFor="p-site">Site</label>
          <select id="p-site" name="siteId" defaultValue={v?.siteId ?? ""}>
            <option value="">Choose a site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="p-job">Job title</label>
          <input className="input" id="p-job" name="jobTitle" maxLength={120} defaultValue={v?.jobTitle} />
        </div>
        <div className="field">
          <label htmlFor="p-mgr">Manager</label>
          <input className="input" id="p-mgr" name="manager" maxLength={120} defaultValue={v?.manager} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="p-notes">Notes</label>
        <textarea id="p-notes" name="notes" maxLength={2000} defaultValue={v?.notes} placeholder={kind === "starter" ? "e.g. Needs Sage and the dispatch label printer" : "e.g. Emails to go to their manager"} />
      </div>
    </>
  );
}

export function ChangeForm({ kind, sites, spares, people }: { kind: "starter" | "leaver"; sites: Opt[]; spares: Spare[]; people: Person[] }) {
  const [state, action, pending] = useActionState<PeopleState, FormData>(createChangeAction, undefined);
  // For a leaver, picking their account fills in the name and email (and finds kit assigned to the account).
  const [who, setWho] = useState<Person | null>(null);
  return (
    <form action={action} className="panel panel-body form" key={who?.id ?? "none"}>
      <input type="hidden" name="kind" value={kind} />
      {kind === "leaver" && people.length > 0 && (
        <div className="field">
          <label htmlFor="p-who">Who&apos;s leaving?</label>
          <select id="p-who" name="userId" value={who?.id ?? ""} onChange={(e) => setWho(people.find((p) => p.id === e.target.value) ?? null)}>
            <option value="">Someone without an IT Hub account</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.email})
              </option>
            ))}
          </select>
        </div>
      )}
      <Details kind={kind} sites={sites} v={who ? { name: who.name, email: who.email, jobTitle: "", siteId: null, manager: "", date: "", notes: "" } : undefined} />
      {kind === "starter" && (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="flabel" style={{ fontWeight: 600, fontSize: ".86rem", marginBottom: 6 }}>
            Kit they&apos;ll get
          </legend>
          {spares.length ? (
            <div className="kit-pick">
              {spares.map((a) => (
                <label key={a.id}>
                  <input type="checkbox" name="kit" value={a.id} />
                  <span>
                    <span className="mono muted">{a.tag}</span> {a.name}
                    <br />
                    <span className="muted" style={{ fontSize: ".76rem" }}>{[a.typeName, a.siteName].filter(Boolean).join(" · ")}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="muted">No spare kit in the inventory. You can add items to their list later.</p>
          )}
        </fieldset>
      )}
      <Msg s={state} />
      <div className="actions">
        <button className="btn primary" disabled={pending}>
          {pending ? "Saving…" : kind === "starter" ? "Add starter" : "Add leaver"}
        </button>
      </div>
    </form>
  );
}

export function EditChange({ kind, sites, v }: { kind: "starter" | "leaver"; sites: Opt[]; v: Values }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<PeopleState, FormData>(updateChangeAction, undefined);
  if (!open)
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Edit details
      </button>
    );
  return (
    <form action={action} className="panel panel-body form" style={{ flexBasis: "100%" }}>
      <input type="hidden" name="id" value={v.id} />
      <Details kind={kind} sites={sites} v={v} />
      <Msg s={state} />
      <div className="actions">
        <button className="btn primary" disabled={pending}>
          Save
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </form>
  );
}

export function TaskRow(props: { changeId: number; id: number; done: boolean; title: string; sub: string; href?: string; canRemove: boolean; disabled: boolean }) {
  const [state, toggle, pending] = useActionState<PeopleState, FormData>(toggleTaskAction, undefined);
  const [rmState, remove] = useActionState<PeopleState, FormData>(removeTaskAction, undefined);
  const err = state?.error || rmState?.error;
  return (
    <div className={`check-row${props.done ? " done" : ""}`}>
      <form action={toggle}>
        <input type="hidden" name="changeId" value={props.changeId} />
        <input type="hidden" name="taskId" value={props.id} />
        <input type="hidden" name="done" value={props.done ? "0" : "1"} />
        <button className="tick" disabled={pending || props.disabled} aria-label={`${props.done ? "Untick" : "Tick"}: ${props.title}`} aria-pressed={props.done}>
          {props.done && <Icon name="check" />}
        </button>
      </form>
      <span className="what">
        {props.href ? <a href={props.href}>{props.title}</a> : props.title}
        {props.sub && <span className="by">{props.sub}</span>}
        {err && <span className="error" style={{ display: "block", marginTop: 4 }}>{err}</span>}
      </span>
      {props.canRemove && (
        <form action={remove}>
          <input type="hidden" name="changeId" value={props.changeId} />
          <input type="hidden" name="taskId" value={props.id} />
          <button className="x" aria-label={`Remove: ${props.title}`} title="Remove from this list">
            ×
          </button>
        </form>
      )}
    </div>
  );
}

export function AddTask({ changeId, kit }: { changeId: number; kit?: { id: number; tag: string; name: string }[] }) {
  const [state, action, pending] = useActionState<PeopleState, FormData>(addTaskAction, undefined);
  return (
    <form action={action} className="actions" style={{ padding: "12px var(--pad)", borderTop: "1px solid var(--line)" }}>
      <input type="hidden" name="changeId" value={changeId} />
      {kit ? (
        <select name="assetId" className="filter" aria-label="Kit to add" required style={{ flex: "1 1 220px" }}>
          <option value="">Add kit…</option>
          {kit.map((a) => (
            <option key={a.id} value={a.id}>
              {a.tag} {a.name}
            </option>
          ))}
        </select>
      ) : (
        <input className="input" name="title" placeholder="Add a task just for this person" aria-label="New task" maxLength={200} required style={{ flex: "1 1 220px" }} />
      )}
      <button className="btn" disabled={pending}>
        {kit ? "Add kit" : "Add task"}
      </button>
      {state?.error && <span className="error">{state.error}</span>}
    </form>
  );
}
