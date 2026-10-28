import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { SocialButtons } from "@/components/social-buttons";
import { signOut } from "@/app/actions-auth";
import { config } from "@/lib/config";
import { getInviteByToken, inviteStatus } from "@/lib/invites";
import { getCurrentUser } from "@/lib/session";
import { InvitePasswordForm } from "./password-form";

export const metadata = { title: "IT team invite" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" });

export default async function InvitePage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const inv = await getInviteByToken(token);
  const status = inv ? inviteStatus(inv) : null;
  const u = await getCurrentUser();
  const claim = `/invite/${encodeURIComponent(token)}/claim`;

  const frame = (children: React.ReactNode) => (
    <AuthFrame title="IT team invite" blurb="Tickets, inventory, printers and the network for all three sites. IT accounts are by invite only.">
      {children}
    </AuthFrame>
  );

  if (!inv || status !== "pending") {
    if (inv && status === "accepted" && u && inv.acceptedById === u.id) {
      return frame(
        <>
          <h2 style={{ fontSize: "1.25rem" }}>You&apos;ve already joined</h2>
          <Link className="btn primary block" href="/setup-2fa">Carry on</Link>
        </>,
      );
    }
    const why = !inv ? "isn't valid" : status === "expired" ? "has expired" : status === "revoked" ? "was cancelled" : "has already been used";
    return frame(
      <>
        <h2 style={{ fontSize: "1.25rem" }}>This invite {why}</h2>
        <p className="muted">Ask an IT admin to send you a new link.</p>
      </>,
    );
  }

  const head = (
    <>
      <div className="label">Step 1 of 3 · Choose how you sign in</div>
      <div className="meter">
        <i className="ok" style={{ width: "33%" }} />
      </div>
      <h2 style={{ fontSize: "1.25rem" }}>Join the IT team</h2>
      <p className="muted">
        You&apos;ve been invited as <strong style={{ color: "var(--fg)" }}>{inv.email}</strong> as an{" "}
        <strong style={{ color: "var(--fg)" }}>{inv.role === "admin" ? "IT admin" : "IT tech"}</strong>. This link works once and expires on{" "}
        {dateFmt.format(inv.expiresAt)}.
      </p>
      {sp.error && <p className="error">{sp.error}</p>}
    </>
  );

  if (u) {
    const matches = u.email.toLowerCase() === inv.email;
    return frame(
      <>
        {head}
        {matches ? (
          <form action={claim} method="get">
            <button className="btn primary block">Join as {u.name}</button>
          </form>
        ) : (
          <>
            <p className="error">
              You&apos;re signed in as {u.email}. Sign out, then open this link again and use {inv.email}.
            </p>
            <form action={signOut}>
              <button className="btn block">Sign out</button>
            </form>
          </>
        )}
      </>,
    );
  }

  return frame(
    <>
      {head}
      <SocialButtons providers={config.providers} callbackURL={claim} />
      {Object.values(config.providers).some(Boolean) && <div className="or">or set a password</div>}
      <InvitePasswordForm token={token} />
      <p className="muted" style={{ fontSize: ".85rem" }}>
        Already have an account? <Link href={`/sign-in?next=${encodeURIComponent(claim)}`}>Sign in first</Link>.
      </p>
    </>,
  );
}
