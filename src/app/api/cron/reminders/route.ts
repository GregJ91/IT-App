import { type NextRequest } from "next/server";
import { sendDailyReminders } from "@/lib/reminders";

// Daily reminders (warranties, licences, low stock). Call once a day from a scheduler with
//   Authorization: Bearer $CRON_SECRET
// It's safe to call more often: it only sends once per day. The IT dashboard also triggers it.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not found", { status: 404 });
  return Response.json(await sendDailyReminders());
}
