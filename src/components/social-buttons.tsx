"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Icon } from "./icons";

type P = { google: boolean; microsoft: boolean; slack: boolean };

export function SocialButtons({ providers, callbackURL }: { providers: P; callbackURL: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (provider: "google" | "microsoft" | "slack") => {
    setBusy(provider);
    await authClient.signIn.social({ provider, callbackURL, errorCallbackURL: "/sign-in?error=provider" });
  };
  const list = [
    providers.microsoft && (["microsoft", "Microsoft", "key"] as const),
    providers.google && (["google", "Google", "globe"] as const),
    providers.slack && (["slack", "Slack", "slack"] as const),
  ].filter(Boolean) as (readonly ["google" | "microsoft" | "slack", string, "key" | "globe" | "slack"])[];
  if (list.length === 0) return null;
  return (
    <>
      {list.map(([id, label, icon]) => (
        <button key={id} type="button" className="sso" disabled={!!busy} onClick={() => go(id)}>
          <Icon name={icon} />
          {busy === id ? "Opening…" : `Continue with ${label}`}
        </button>
      ))}
    </>
  );
}
