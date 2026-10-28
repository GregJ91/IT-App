import { type NextRequest } from "next/server";
import { ASSET_TEMPLATE, STOCK_TEMPLATE } from "@/lib/csv-import";
import { getCurrentUser, isITRole } from "@/lib/session";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const u = await getCurrentUser();
  if (!u || !isITRole(u.role)) return new Response("Not found", { status: 404 });
  const { name } = await ctx.params;
  const body = name === "assets.csv" ? ASSET_TEMPLATE : name === "stock.csv" ? STOCK_TEMPLATE : null;
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="it-hub-${name.replace(".csv", "")}-template.csv"`,
    },
  });
}
