"use client";
import { useActionState, useEffect } from "react";
import { verifyCode, type FormState } from "@/app/actions-auth";

export function CodeForm({ next, label = "Verify" }: { next?: string; label?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyCode, undefined);
  useEffect(() => {
    if (state?.ok) window.location.assign(state.next ?? "/");
  }, [state]);
  return (
    <form action={action} className="form" style={{ gap: 12 }}>
      {state?.error && <p className="error">{state.error}</p>}
      <div className="field">
        <label htmlFor="code">6-digit code</label>
        <input className="input code-input" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
      </div>
      {next && <input type="hidden" name="next" value={next} />}
      <button className="btn primary block" disabled={pending}>
        {pending || state?.ok ? "Checking…" : label}
      </button>
    </form>
  );
}
