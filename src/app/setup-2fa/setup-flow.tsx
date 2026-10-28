"use client";
import { useActionState } from "react";
import { beginTwoFactor, type SetupState } from "@/app/actions-auth";
import { CodeForm } from "@/components/code-form";

function Steps({ n }: { n: number }) {
  return (
    <>
      <div className="label">Step {n} of 3 · {n === 2 ? "Add an authenticator code" : "Choose how you sign in"}</div>
      <div className="meter">
        <i className="ok" style={{ width: `${(n / 3) * 100}%` }} />
      </div>
    </>
  );
}

export function SetupFlow({ needsPassword, name, appUrl }: { needsPassword: boolean; name: string; appUrl: string }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(beginTwoFactor, undefined);
  if (!state?.qr) {
    return (
      <form action={action} className="form" style={{ gap: 12 }}>
        <Steps n={2} />
        <h2 style={{ fontSize: "1.25rem" }}>Add an authenticator code, {name}</h2>
        <p className="muted">
          IT accounts need a second step when signing in. You&apos;ll need Microsoft Authenticator, Google Authenticator or a password manager that
          does codes.
        </p>
        {state?.error && <p className="error">{state.error}</p>}
        {needsPassword && (
          <div className="field">
            <label htmlFor="pw">Your password</label>
            <input className="input" id="pw" name="password" type="password" autoComplete="current-password" required />
          </div>
        )}
        <button className="btn primary block" disabled={pending}>
          {pending ? "Starting…" : "Show my QR code"}
        </button>
      </form>
    );
  }
  return (
    <>
      <Steps n={2} />
      <h2 style={{ fontSize: "1.25rem" }}>Scan this code</h2>
      <p className="muted">Scan it with your authenticator app, then type the 6-digit code it shows.</p>
      <div className="qr-box">
        <img src={state.qr} alt="QR code for your authenticator app" />
      </div>
      {state.secret && (
        <p className="muted" style={{ fontSize: ".8rem", overflowWrap: "anywhere" }}>
          Can&apos;t scan? Enter this key instead: <span className="mono">{state.secret}</span>
        </p>
      )}
      {state.backupCodes && (
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Backup codes (save these somewhere safe)</summary>
          <p className="muted" style={{ fontSize: ".8rem", margin: "6px 0" }}>Each one works once if you lose your phone.</p>
          <div className="codes">
            {state.backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </details>
      )}
      <CodeForm next="/it" label="Verify and finish" />
      <p className="note">
        On your phone, open <span className="mono">{appUrl.replace(/^https?:\/\//, "")}</span>, sign in the same way and enter a code. Then tap Share,{" "}
        <strong>Add to Home Screen</strong> (iPhone) or <strong>Install app</strong> (Android).
      </p>
    </>
  );
}
