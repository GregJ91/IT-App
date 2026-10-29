import { type NextRequest } from "next/server";
import { pollAll } from "@/lib/network/poll";

// For a scheduler, if the built-in poller is turned off: call every minute with "Authorization: Bearer $CRON_SECRET".
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not found", { status: 404 });
  return Response.json(await pollAll());
}
