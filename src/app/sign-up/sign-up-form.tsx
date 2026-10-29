"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      // POST, so the password never ends up in the address bar if scripts fail to load.
      method="post"
      className="form"
      style={{ gap: 12 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const password = String(f.get("password"));
        if (password !== String(f.get("confirm"))) return setError("The two passwords don't match.");
        setBusy(true);
        setError(null);
        const { error } = await authClient.signUp.email({
          name: String(f.get("name")).trim(),
          email: String(f.get("email")).trim(),
          password,
        });
        setBusy(false);
        if (error) return setError(error.message ?? "Couldn't create the account.");
        router.push("/my");
        router.refresh();
      }}
    >
      {error && <p className="error">{error}</p>}
      <div className="field">
        <label htmlFor="su-name">Your name</label>
        <input className="input" id="su-name" name="name" autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor="su-email">Work email</label>
        <input className="input" id="su-email" name="email" type="email" autoComplete="email" required placeholder="you@gardenersdream.co.uk" />
      </div>
      <div className="field">
        <label htmlFor="su-pass">Password</label>
        <input className="input" id="su-pass" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <span className="hint">At least 10 characters.</span>
      </div>
      <div className="field">
        <label htmlFor="su-confirm">Type it again</label>
        <input className="input" id="su-confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <button className="btn primary block" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </button>
      <p className="muted" style={{ fontSize: ".85rem" }}>
        Already have one? <Link href="/sign-in">Sign in</Link>
      </p>
    </form>
  );
}
