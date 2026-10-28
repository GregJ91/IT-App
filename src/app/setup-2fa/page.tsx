import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { hasPassword } from "@/lib/auth-helpers";
import { config } from "@/lib/config";
import { getCurrentUser, isITRole, sessionVerified } from "@/lib/session";
import { SetupFlow } from "./setup-flow";

export const metadata = { title: "Add an authenticator" };

export default async function Setup() {
  const u = await getCurrentUser();
  if (!u) redirect("/sign-in");
  if (!isITRole(u.role)) redirect("/my");
  if (u.twoFactorEnabled) redirect((await sessionVerified(u.sessionId)) ? "/it" : "/verify");
  return (
    <AuthFrame title="IT team setup" blurb="Tickets, inventory, printers and the network for all three sites. IT accounts are by invite only.">
      <SetupFlow needsPassword={await hasPassword(u.id)} name={u.name.split(" ")[0]} appUrl={config.appUrl} />
    </AuthFrame>
  );
}
