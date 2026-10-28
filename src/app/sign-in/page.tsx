import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { SocialButtons } from "@/components/social-buttons";
import { safeNext } from "@/lib/auth-helpers";
import { config } from "@/lib/config";
import { getCurrentUser, homeFor } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "too-many-codes": "Too many wrong codes. Sign in again to get a fresh go.",
  provider: "That sign-in didn't work. Make sure you used your work account.",
};

export default async function SignIn({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const u = await getCurrentUser();
  if (u) redirect(next ?? homeFor(u.role));
  return (
    <AuthFrame title="Get IT help, fast" blurb="Raise a job, add a screenshot and see exactly where it is up to.">
      <h2 style={{ fontSize: "1.25rem" }}>Sign in</h2>
      {sp.error && <p className="error">{ERRORS[sp.error] ?? "Something went wrong. Try again."}</p>}
      <SocialButtons providers={config.providers} callbackURL={next ?? "/"} />
      {Object.values(config.providers).some(Boolean) && <div className="or">or use email</div>}
      <SignInForm next={next} />
      <p className="note">
        IT team: open the invite link you were sent. After that, sign in here the same way on any phone or computer.
      </p>
    </AuthFrame>
  );
}
