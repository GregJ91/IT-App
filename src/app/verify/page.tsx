import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { CodeForm } from "@/components/code-form";
import { safeNext } from "@/lib/auth-helpers";
import { getCurrentUser, homeFor, isITRole, sessionVerified } from "@/lib/session";

export const metadata = { title: "Enter your code" };

export default async function Verify({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next) ?? undefined;
  const u = await getCurrentUser();
  // Signed-in users only need this page if they're IT and haven't entered a code on this session yet.
  if (u) {
    if (!isITRole(u.role)) redirect(homeFor(u.role));
    if (!u.twoFactorEnabled) redirect("/setup-2fa");
    if (await sessionVerified(u.sessionId)) redirect(next ?? "/it");
  }
  return (
    <AuthFrame title="IT team sign-in" blurb="IT accounts can see the whole network, so they need a code from your authenticator app as well.">
      <h2 style={{ fontSize: "1.25rem" }}>Enter your code</h2>
      <p className="muted">Open your authenticator app and type the 6-digit code for Gardeners Dream IT.</p>
      <CodeForm next={next} />
    </AuthFrame>
  );
}
