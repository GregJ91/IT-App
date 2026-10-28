import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { acceptInvite } from "@/lib/invites";
import { getCurrentUser } from "@/lib/session";

// Landing point after signing in or signing up from an invite link.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const back = (q = "") => NextResponse.redirect(new URL(`/invite/${encodeURIComponent(token)}${q}`, config.appUrl));
  const u = await getCurrentUser();
  if (!u) return back();
  const res = await acceptInvite(token, u);
  if (!res.ok) return back(`?error=${encodeURIComponent(res.reason)}`);
  return NextResponse.redirect(new URL("/setup-2fa", config.appUrl));
}
