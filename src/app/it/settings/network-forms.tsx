"use client";
import { useActionState, useState } from "react";
import { addNetConnection, checkNetConnection, saveNetAlerts, updateNetConnection, type SettingsState } from "./actions";

function Msg({ s }: { s: SettingsState }) {
  if (!s) return null;
  return s.error ? <p className="error">{s.error}</p> : s.ok ? <p className="success">{s.ok}</p> : null;
}

const HELP = {
  console: "In UniFi Network on the console: Settings → Control Plane → Integrations → Create API key. Needs Network 9 or newer. The app must be able to reach the console, so it has to run on that network or over a VPN.",
  cloud: "At unifi.ui.com: API (left menu) → Create API key. Works from anywhere, shows every site's kit and internet line, but only a count of connected devices.",
  example: "A made-up network for three sites, to try the Network pages without any UniFi kit. Remove it before connecting the real thing.",
};

export function AddConnectionForm() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(addNetConnection, undefined);
  const [kind, setKind] = useState<"console" | "cloud" | "example">("console");
  return (
    <form action={action} className="form" style={{ gap: 10, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
      <h3>Add a connection</h3>
      <div className="tabs" role="group" aria-label="What are you connecting?">
        {(
          [
            ["console", "On-site console"],
            ["cloud", "UniFi cloud"],
            ["example", "Example network"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" className="tab" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {l}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />
      <p className="hint">{HELP[kind]}</p>
      {kind !== "example" && (
        <>
          <input className="input" name="name" placeholder={kind === "cloud" ? "Name, e.g. UniFi cloud" : "Name, e.g. Head Office UDM Pro"} aria-label="Connection name" />
          {kind === "console" ? (
            <input className="input mono" name="url" placeholder="https://192.168.1.1" aria-label="Console address" autoComplete="off" />
          ) : (
            <input type="hidden" name="url" value="" />
          )}
          <input className="input mono" name="apiKey" type="password" placeholder="API key" aria-label="API key" autoComplete="off" />
          {kind === "console" && (
            <label className="actions" style={{ fontSize: ".85rem" }}>
              <input type="checkbox" name="trustCert" defaultChecked /> Trust this console&apos;s own certificate (UniFi consoles don&apos;t have a public one)
            </label>
          )}
        </>
      )}
      <Msg s={state} />
      <div className="actions">
        <button className="btn primary" disabled={pending}>
          {pending ? "Checking…" : kind === "example" ? "Add example network" : "Check and connect"}
        </button>
      </div>
      <p className="hint">IT Hub only reads from UniFi. It never changes settings or restarts anything. API keys are stored encrypted.</p>
    </form>
  );
}

export function CheckNowButton({ id }: { id: number }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(checkNetConnection, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 6 }}>
      <input type="hidden" name="id" value={id} />
      <button className="btn small" disabled={pending}>
        {pending ? "Checking…" : "Check now"}
      </button>
      <Msg s={state} />
    </form>
  );
}

export function EditConnection({ id, url, trustCert, isConsole }: { id: number; url: string; trustCert: boolean; isConsole: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateNetConnection, undefined);
  if (!open)
    return (
      <button type="button" className="btn small" onClick={() => setOpen(true)}>
        Change key
      </button>
    );
  return (
    <form action={action} className="form" style={{ gap: 8, width: "100%" }}>
      <input type="hidden" name="id" value={id} />
      {isConsole && <input className="input mono" name="url" defaultValue={url} aria-label="Console address" />}
      <input className="input mono" name="apiKey" type="password" placeholder="New API key (leave blank to keep)" aria-label="New API key" autoComplete="off" />
      {isConsole && (
        <label className="actions" style={{ fontSize: ".85rem" }}>
          <input type="checkbox" name="trustCert" defaultChecked={trustCert} /> Trust this console&apos;s own certificate
        </label>
      )}
      <Msg s={state} />
      <div className="actions">
        <button className="btn primary small" disabled={pending}>
          Save
        </button>
        <button type="button" className="btn small" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </form>
  );
}

export function NetAlertsForm({ alertAfterMin, autoTicket, addKit }: { alertAfterMin: number; autoTicket: boolean; addKit: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveNetAlerts, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 4 }}>
      <label className="setting">
        <span>
          <strong>Count it as an outage after</strong>
          <br />
          <span className="muted" style={{ fontSize: ".8rem" }}>Shorter blips are ignored. Alerts go to IT by email and Slack.</span>
        </span>
        <span className="actions">
          <input className="input" name="alertAfterMin" type="number" min={1} max={120} defaultValue={alertAfterMin} style={{ width: 80 }} aria-label="Minutes" /> min
        </span>
      </label>
      <label className="setting" style={{ cursor: "pointer" }}>
        <span>
          <strong>Raise a P1 ticket when a site&apos;s internet goes down</strong>
          <br />
          <span className="muted" style={{ fontSize: ".8rem" }}>So the outage is tracked like any other job.</span>
        </span>
        <input type="checkbox" name="autoTicket" defaultChecked={autoTicket} style={{ width: 20, height: 20 }} />
      </label>
      <label className="setting" style={{ cursor: "pointer" }}>
        <span>
          <strong>Add UniFi kit to the inventory</strong>
          <br />
          <span className="muted" style={{ fontSize: ".8rem" }}>Gateways, switches and access points, matched by MAC address.</span>
        </span>
        <input type="checkbox" name="addKit" defaultChecked={addKit} style={{ width: 20, height: 20 }} />
      </label>
      <Msg s={state} />
      <div className="actions">
        <button className="btn" disabled={pending}>
          Save alert settings
        </button>
      </div>
    </form>
  );
}
