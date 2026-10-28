import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { readUpload } from "@/lib/storage";
import { getAttachmentForViewer } from "@/lib/tickets";

// Screenshots are only served to the person who raised the job and the IT team.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new Response("Sign in to see this file.", { status: 401 });
  const { id } = await ctx.params;
  const a = await getAttachmentForViewer(Number(id), u);
  if (!a) return new Response("Not found", { status: 404 });
  const body = await readUpload(a.storageKey);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${a.filename.replace(/["\\\r\n]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
