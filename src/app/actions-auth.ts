"use server";
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { acceptInvite, getInviteByToken, inviteStatus } from "@/lib/invites";
import { hasPassword, safeNext } from "@/lib/auth-helpers";
import { getCurrentUser, getSession, isITRole } from "@/lib/session";

export type FormState = { error?: string; ok?: boolean; next?: string } | undefined;

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-in");
}

const MAX_CODE_ATTEMPTS = 5;

async function markVerified(sessionToken: string) {
  const s = await db.query.session.findFirst({ where: eq(schema.session.token, sessionToken) });
  if (!s) return;
  await db
    .insert(schema.sessionCheck)
    .values({ sessionId: s.id, verifiedAt: new Date() })
    .onConflictDoUpdate({ target: schema.sessionCheck.sessionId, set: { verifiedAt: new Date(), failedAttempts: 0 } });
}

/**
 * Checks an authenticator code. Works both mid sign-in (email + password with 2FA)
 * and as the extra step IT accounts take after Microsoft, Google or Slack sign-in.
 */
export async function verifyCode(_: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  const h = await headers();
  const existing = await getSession();

  if (existing) {
    const check = await db.query.sessionCheck.findFirst({ where: eq(schema.sessionCheck.sessionId, existing.session.id) });
    if ((check?.failedAttempts ?? 0) >= MAX_CODE_ATTEMPTS) {
      await auth.api.signOut({ headers: h });
      redirect("/sign-in?error=too-many-codes");
    }
  }

  let token: string;
  try {
    const { headers: out, response } = await auth.api.verifyTOTP({ body: { code }, headers: h, returnHeaders: true });
    // Turning two-factor on swaps in a new session; its token is in the new cookie, not the response body.
    token = sessionTokenFrom(out.get("set-cookie")) ?? response.token;
  } catch {
    if (existing) {
      await db
        .insert(schema.sessionCheck)
        .values({ sessionId: existing.session.id, failedAttempts: 1 })
        .onConflictDoUpdate({
          target: schema.sessionCheck.sessionId,
          set: { failedAttempts: sql`${schema.sessionCheck.failedAttempts} + 1` },
        });
    }
    return { error: "That code didn't work. Codes change every 30 seconds, so try the newest one." };
  }
  await markVerified(token);
  // The browser moves on with a fresh request. Rendering the next page inside this
  // response would still see the old cookie and sign the user out again.
  return { ok: true, next: safeNext(form.get("next")) ?? "/" };
}

function sessionTokenFrom(setCookie: string | null) {
  const m = setCookie?.match(/(?:^|,\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]).split(".")[0] : null;
}

/* ---------- authenticator setup ---------- */

export type SetupState = { error?: string; qr?: string; secret?: string; backupCodes?: string[] } | undefined;

export async function beginTwoFactor(_: SetupState, form: FormData): Promise<SetupState> {
  const u = await getCurrentUser();
  if (!u || !isITRole(u.role)) redirect("/sign-in");
  const password = String(form.get("password") ?? "");
  try {
    const res = await auth.api.enableTwoFactor({
      body: (await hasPassword(u.id)) ? { password, method: "totp" } : { method: "totp" },
      headers: await headers(),
    });
    if (res.method !== "totp") throw new Error("unexpected 2FA method");
    const qr = await QRCode.toDataURL(res.totpURI, { margin: 1, width: 360 });
    const secret = new URL(res.totpURI).searchParams.get("secret") ?? undefined;
    return { qr, secret, backupCodes: res.backupCodes };
  } catch {
    return { error: (await hasPassword(u.id)) ? "That password isn't right." : "Couldn't start setup. Try again." };
  }
}

/* ---------- invites ---------- */

export async function createAccountFromInvite(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const inv = await getInviteByToken(token);
  if (!inv || inviteStatus(inv) !== "pending") return { error: "This invite is no longer valid." };
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  const existing = await db.query.user.findFirst({ where: eq(schema.user.email, inv.email) });
  if (existing) return { error: `There's already an account for ${inv.email}. Sign in instead, then open this link again.` };
  let created: { id: string; email: string };
  try {
    const res = await auth.api.signUpEmail({ body: { email: inv.email, name: inv.name, password }, headers: await headers() });
    created = res.user;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the account." };
  }
  const accepted = await acceptInvite(token, created);
  if (!accepted.ok) return { error: accepted.reason };
  redirect("/setup-2fa");
}
