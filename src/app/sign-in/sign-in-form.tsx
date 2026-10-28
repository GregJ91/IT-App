"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form"
      style={{ gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        const { data, error } = await authClient.signIn.email({
          email: String(f.get("email")),
          password: String(f.get("password")),
        });
        setBusy(false);
        if (error) return setError(error.message ?? "That email and password don't match.");
        const q = next ? `?next=${encodeURIComponent(next)}` : "";
        if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return router.push(`/verify${q}`);
        router.push(next ?? "/");
        router.refresh();
      }}
    >
      {error && <p className="error">{error}</p>}
      <input className="input" id="si-email" name="email" type="email" autoComplete="email" required placeholder="you@gardenersdream.co.uk" aria-label="Email" />
      <input className="input" id="si-pass" name="password" type="password" autoComplete="current-password" required placeholder="Password" aria-label="Password" />
      <button className="btn primary block" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="muted" style={{ fontSize: ".85rem" }}>
        New here? <Link href="/sign-up">Create an account</Link> with your work email.
      </p>
    </form>
  );
}
