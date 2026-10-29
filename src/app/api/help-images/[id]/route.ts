import { type NextRequest } from "next/server";
import { getHelpImage } from "@/lib/help";
import { getCurrentUser } from "@/lib/session";
import { readUpload } from "@/lib/storage";

// Screenshots in help articles: anyone signed in can see them.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new Response("Sign in to see this image.", { status: 401 });
  const img = await getHelpImage(Number((await ctx.params).id));
  if (!img) return new Response("Not found", { status: 404 });
  const body = await readUpload(img.storageKey);
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": img.mimeType, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
