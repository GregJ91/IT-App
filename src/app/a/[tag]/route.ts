import { NextResponse, type NextRequest } from "next/server";
import { findAssetByTag } from "@/lib/assets";
import { config } from "@/lib/config";
import { getCurrentUser, isITRole } from "@/lib/session";

// Where an asset's QR label points. IT open the item; anyone else can report a problem with it.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ tag: string }> }) {
  const { tag } = await ctx.params;
  const go = (path: string) => NextResponse.redirect(new URL(path, config.appUrl));
  const u = await getCurrentUser();
  if (!u) return go(`/sign-in?next=${encodeURIComponent(`/a/${tag}`)}`);
  const a = await findAssetByTag(tag);
  if (!isITRole(u.role)) return go(a ? `/my/new?about=${encodeURIComponent(a.tag)}` : "/my/new");
  return go(a ? `/it/assets/${a.id}` : `/it/assets?q=${encodeURIComponent(tag)}`);
}
