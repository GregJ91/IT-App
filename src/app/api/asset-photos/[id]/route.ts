import { type NextRequest } from "next/server";
import { getAssetPhoto } from "@/lib/assets";
import { getCurrentUser } from "@/lib/session";
import { readUpload } from "@/lib/storage";

// Inventory photos are for the IT team only.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new Response("Sign in to see this photo.", { status: 401 });
  const { id } = await ctx.params;
  const p = await getAssetPhoto(Number(id), u);
  if (!p) return new Response("Not found", { status: 404 });
  const body = await readUpload(p.storageKey);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": p.mimeType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
