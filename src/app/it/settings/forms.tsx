"use client";
import { useActionState, useEffect, useRef } from "react";
import { CopyButton } from "@/components/copy-button";
import { addChecklistTask, addListItem, changeRole, newInviteLink, renameListItem, saveSla, saveWorkingHours, sendInvite, testSlack, type SettingsState } from "./actions";

function Msg({ s }: { s: SettingsState }) {
  if (!s) return null;
  return (
    <>
      {s.error && <p className="error">{s.error}</p>}
      {s.ok && <p className="success">{s.ok}</p>}
      {s.link && (
        <p className="note" style={{ overflowWrap: "anywhere" }}>
          Link (shown once): <span className="mono">{s.link}</span> <CopyButton text={s.link} />
        </p>
      )}
    </>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(sendInvite, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="form" style={{ gap: 10, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
      <h3>Invite someone to the IT team</h3>
      <Msg s={state} />
      <div className="two">
        <input className="input" name="name" required placeholder="Name" aria-label="Name" />
        <input className="input" name="email" type="email" required placeholder="Work email" aria-label="Work email" />
      </div>
      <div className="actions">
        <select name="role" aria-label="Role" defaultValue="tech" className="filter" style={{ padding: "9px 10px" }}>
          <option value="tech">IT tech</option>
          <option value="admin">IT admin</option>
        </select>
        <button className="btn primary" disabled={pending}>
          {pending ? "Sending…" : "Send invite"}
        </button>
      </div>
    </form>
  );
}

export function NewLinkButton({ id }: { id: number }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(newInviteLink, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 6 }}>
      <input type="hidden" name="id" value={id} />
      <button className="btn small" disabled={pending}>
        Send new link
      </button>
      <Msg s={state} />
    </form>
  );
}

export function RoleSelect({ userId, role, self }: { userId: string; role: string; self: boolean }) {
  const [state, action] = useActionState<SettingsState, FormData>(changeRole, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 6 }}>
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        defaultValue={role}
        aria-label="Role"
        className="filter"
        disabled={self}
        title={self ? "You can't change your own role" : undefined}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="tech">IT tech</option>
        <option value="admin">IT admin</option>
        <option value="staff">Remove from IT</option>
      </select>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}

const split = (min: number): [number, string] => (min % 1440 === 0 ? [min / 1440, "days"] : min % 60 === 0 ? [min / 60, "hours"] : [min, "min"]);

export function SlaForm({ policies }: { policies: { priority: number; label: string; responseMinutes: number; resolveMinutes: number; counts: string }[] }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSla, undefined);
  const Unit = ({ name, value }: { name: string; value: string }) => (
    <select name={name} defaultValue={value} aria-label="Unit" style={{ minWidth: 80 }}>
      <option value="min">min</option>
      <option value="hours">hours</option>
      <option value="days">days</option>
    </select>
  );
  return (
    <form action={action}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Priority</th>
              <th>First response</th>
              <th>Fixed within</th>
              <th>Counts</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => {
              const [r, ru] = split(p.responseMinutes);
              const [f, fu] = split(p.resolveMinutes);
              return (
                <tr key={p.priority}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className={`prio p${p.priority}`}>P{p.priority}</span> {p.label}
                  </td>
                  <td>
                    <span className="actions" style={{ flexWrap: "nowrap" }}>
                      <input name={`r${p.priority}`} type="number" min={1} defaultValue={r} aria-label={`P${p.priority} first response`} />
                      <Unit name={`ru${p.priority}`} value={ru} />
                    </span>
                  </td>
                  <td>
                    <span className="actions" style={{ flexWrap: "nowrap" }}>
                      <input name={`f${p.priority}`} type="number" min={1} defaultValue={f} aria-label={`P${p.priority} fixed within`} />
                      <Unit name={`fu${p.priority}`} value={fu} />
                    </span>
                  </td>
                  <td>
                    <select name={`c${p.priority}`} defaultValue={p.counts} aria-label={`P${p.priority} counts`} style={{ minWidth: 130 }}>
                      <option value="any">Any time</option>
                      <option value="hours">Working hours</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel-body stack" style={{ gap: 8 }}>
        <Msg s={state} />
        <div className="actions">
          <button className="btn primary" disabled={pending}>
            Save SLA targets
          </button>
        </div>
      </div>
    </form>
  );
}

function RenameRow({ kind, id, name, archive }: { kind: string; id: number; name: string; archive: (f: FormData) => Promise<void> }) {
  const [state, action] = useActionState<SettingsState, FormData>(renameListItem, undefined);
  return (
    <div className="setting">
      <form action={action} className="actions" style={{ flex: 1 }}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <input className="input" name="name" defaultValue={name} aria-label={`Rename ${name}`} style={{ flex: 1, minWidth: 0, padding: "6px 10px" }} />
        <button className="btn small">Save</button>
      </form>
      <form action={archive}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <button className="btn small danger">Hide</button>
      </form>
      {state?.error && <p className="error" style={{ width: "100%" }}>{state.error}</p>}
    </div>
  );
}

export function ListEditor(props: { kind: "site" | "category" | "type"; title: string; items: { id: number; name: string }[]; archive: (f: FormData) => Promise<void> }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(addListItem, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{props.title}</h2>
      </div>
      <div className="panel-body stack" style={{ gap: 8 }}>
        <div>
          {props.items.map((i) => (
            <RenameRow key={i.id} kind={props.kind} id={i.id} name={i.name} archive={props.archive} />
          ))}
        </div>
        <form ref={form} action={action} className="actions">
          <input type="hidden" name="kind" value={props.kind} />
          <input className="input" name="name" placeholder={`Add a ${props.kind === "type" ? "kit type" : props.kind}`} aria-label={`New ${props.kind}`} style={{ flex: 1, minWidth: 0 }} />
          <button className="btn" disabled={pending}>
            Add
          </button>
        </form>
        <Msg s={state} />
        <p className="muted" style={{ fontSize: ".78rem" }}>Hidden ones stay on old tickets but can&apos;t be picked for new ones.</p>
      </div>
    </section>
  );
}

export function SlackTest() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(testSlack, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <Msg s={state} />
      <div className="actions">
        <button className="btn" disabled={pending}>
          {pending ? "Sending…" : "Send test message"}
        </button>
      </div>
    </form>
  );
}

const DAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
] as const;

export function WorkingHoursForm({ hours, pause }: { hours: { start: string; end: string; days: number[] }; pause: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveWorkingHours, undefined);
  return (
    <form action={action} className="panel-body stack" style={{ gap: 12 }}>
      <div className="actions">
        <label className="field" style={{ gap: 4 }}>
          <span className="flabel" style={{ fontWeight: 600, fontSize: ".86rem" }}>From</span>
          <input className="input" type="time" name="start" defaultValue={hours.start} required style={{ width: 130 }} />
        </label>
        <label className="field" style={{ gap: 4 }}>
          <span className="flabel" style={{ fontWeight: 600, fontSize: ".86rem" }}>Until</span>
          <input className="input" type="time" name="end" defaultValue={hours.end} required style={{ width: 130 }} />
        </label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, fontSize: ".86rem", marginBottom: 6 }}>Days</legend>
        <div className="actions">
          {DAYS.map(([n, label]) => (
            <label key={n} className="chip plain" style={{ padding: "6px 10px", cursor: "pointer", gap: 6 }}>
              <input type="checkbox" name="days" value={n} defaultChecked={hours.days.includes(n)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="setting" style={{ cursor: "pointer" }}>
        <span>
          <strong>Pause the fix clock while waiting on the requester</strong>
          <br />
          <span className="muted" style={{ fontSize: ".8rem" }}>It restarts as soon as they reply or the status changes.</span>
        </span>
        <input type="checkbox" name="pause" defaultChecked={pause} style={{ width: 20, height: 20 }} />
      </label>
      <Msg s={state} />
      <div className="actions">
        <button className="btn primary" disabled={pending}>
          Save working hours
        </button>
      </div>
    </form>
  );
}

export function ChecklistEditor(props: { kind: "starter" | "leaver"; items: { id: number; title: string }[]; remove: (f: FormData) => Promise<void> }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(addChecklistTask, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{props.kind === "starter" ? "Starter checklist" : "Leaver checklist"}</h2>
      </div>
      <div className="panel-body stack" style={{ gap: 8 }}>
        <div>
          {props.items.map((i) => (
            <form key={i.id} action={props.remove} className="setting">
              <input type="hidden" name="id" value={i.id} />
              <span>{i.title}</span>
              <button className="btn small" aria-label={`Remove: ${i.title}`}>
                Remove
              </button>
            </form>
          ))}
        </div>
        <form ref={form} action={action} className="actions">
          <input type="hidden" name="kind" value={props.kind} />
          <input className="input" name="title" placeholder="Add a task" aria-label={`New ${props.kind} task`} maxLength={200} style={{ flex: 1, minWidth: 0 }} />
          <button className="btn" disabled={pending}>
            Add
          </button>
        </form>
        <Msg s={state} />
        <p className="muted" style={{ fontSize: ".78rem" }}>
          Copied onto each new {props.kind}. Kit is added separately. Changes don&apos;t affect people already added.
        </p>
      </div>
    </section>
  );
}
