"use client";
import { useActionState } from "react";
import { raiseTicket, type ActionState } from "@/app/actions-tickets";
import { FilePicker } from "@/components/file-picker";
import { PRIORITY_HELP } from "@/lib/tickets-shared";

type Opt = { id: number; name: string };

type About = { tag: string; name: string; siteId: number | null; location: string; categoryId: number | null };

export function RaiseForm(props: { sites: Opt[]; categories: Opt[]; policies: { priority: number; label: string }[]; phone: string; about?: About }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(raiseTicket, undefined);
  const about = props.about;
  return (
    <form action={action} className="panel panel-body form">
      {state?.error && <p className="error">{state.error}</p>}
      {about && (
        <>
          <input type="hidden" name="assetTag" value={about.tag} />
          <p className="note">
            About <strong className="mono">{about.tag}</strong> {about.name}
            {about.location && ` (${about.location})`}
          </p>
        </>
      )}
      <div className="field">
        <label htmlFor="f-title">What&apos;s the problem?</label>
        <input className="input" id="f-title" name="title" required maxLength={160} placeholder={about ? `What's wrong with the ${about.name}?` : "e.g. Label printer printing blank labels"} />
      </div>
      <div className="field">
        <label htmlFor="f-desc">Details</label>
        <textarea id="f-desc" name="description" required placeholder="What happened, when it started, and what you've tried." />
      </div>
      <div className="field">
        <span className="flabel">Screenshots or photos</span>
        <FilePicker />
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="f-site">Site</label>
          <select id="f-site" name="siteId" defaultValue={about?.siteId ?? ""}>
            <option value="">Choose a site</option>
            {props.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-loc">Where exactly?</label>
          <input className="input" id="f-loc" name="location" maxLength={200} defaultValue={about?.location} placeholder="e.g. Dispatch bench 2" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="f-cat">What&apos;s it about?</label>
        <select id="f-cat" name="categoryId" defaultValue={about?.categoryId ?? ""}>
          <option value="">Not sure</option>
          {props.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="flabel" style={{ fontWeight: 600, fontSize: ".86rem", marginBottom: 6 }}>
          How urgent is it?
        </legend>
        <div className="prio-pick">
          {props.policies.map((p) => (
            <label key={p.priority}>
              <input type="radio" name="priority" value={p.priority} defaultChecked={p.priority === 3} />
              <span>
                <span className={`prio p${p.priority}`}>P{p.priority}</span> <strong>{p.label}</strong>
              </span>
              <small>{PRIORITY_HELP[p.priority]}</small>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="f-phone">Best number to reach you</label>
        <input className="input mono" id="f-phone" name="contactPhone" inputMode="tel" autoComplete="tel" maxLength={40} defaultValue={props.phone} />
        <span className="hint">Only IT can see this.</span>
      </div>
      <div className="actions">
        <button className="btn primary" disabled={pending}>
          {pending ? "Sending…" : "Send to IT"}
        </button>
      </div>
    </form>
  );
}
