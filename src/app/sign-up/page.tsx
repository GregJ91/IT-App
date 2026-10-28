import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { getCurrentUser, homeFor } from "@/lib/session";
import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Create account" };

export default async function SignUp() {
  const u = await getCurrentUser();
  if (u) redirect(homeFor(u.role));
  return (
    <AuthFrame title="Get IT help, fast" blurb="Create an account with your work email to raise and track IT jobs.">
      <h2 style={{ fontSize: "1.25rem" }}>Create an account</h2>
      <SignUpForm />
    </AuthFrame>
  );
}
