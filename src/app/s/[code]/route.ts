import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { getCurrentUser, isITRole } from "@/lib/session";
import { findStockByCode } from "@/lib/stock";

// Where a shelf label points.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const go = (path: string) => NextResponse.redirect(new URL(path, config.appUrl));
  const u = await getCurrentUser();
  if (!u) return go(`/sign-in?next=${encodeURIComponent(`/s/${code}`)}`);
  if (!isITRole(u.role)) return go("/my");
  const item = await findStockByCode(code);
  return go(item ? `/it/stock/${item.id}` : `/it/stock?q=${encodeURIComponent(code)}`);
}
