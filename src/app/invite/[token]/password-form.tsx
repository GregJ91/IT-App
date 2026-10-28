"use client";
import { useActionState } from "react";
import { createAccountFromInvite, type FormState } from "@/app/actions-auth";

export function InvitePasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAccountFromInvite, undefined);
  return (
    <form action={action} className="form" style={{ gap: 10 }}>
      {state?.error && <p className="error">{state.error}</p>}
      <input type="hidden" name="token" value={token} />
      <input className="input" id="inv-pass" name="password" type="password" autoComplete="new-password" minLength={10} required placeholder="New password (10+ characters)" aria-label="New password" />
      <input className="input" id="inv-pass2" name="confirm" type="password" autoComplete="new-password" required placeholder="Type it again" aria-label="Type the password again" />
      <button className="btn primary block" disabled={pending}>
        {pending ? "Setting up…" : "Continue"}
      </button>
    </form>
  );
}
