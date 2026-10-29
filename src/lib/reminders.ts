// "Coming up" on the dashboard, and the daily reminder email/Slack message.
import { and, asc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { localParts } from "./calendar";
import { link, sendMail } from "./notify";
import { esc, postToChannel, slackMode } from "./slack";
import { upcomingChanges } from "./people";
import { listStock } from "./stock";

const { asset, licence, appSetting, user } = schema;

export const REMINDER_DAYS = 30;

/** Today's date in the UK as YYYY-MM-DD. */
export function ukToday(now = new Date()) {
  const p = localParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 864e5);
}

export type ComingUp = {
  warranties: { id: number; tag: string; name: string; date: string; days: number }[];
  licences: { id: number; name: string; date: string; days: number; seats: number | null }[];
  lowStock: { id: number; name: string; quantity: number; minQuantity: number }[];
  people: Awaited<ReturnType<typeof upcomingChanges>>;
};

export async function comingUp(now = new Date(), days = REMINDER_DAYS): Promise<ComingUp> {
  const today = ukToday(now);
  const until = addDays(today, days);
  const [w, l, s, people] = await Promise.all([
    db
      .select({ id: asset.id, tag: asset.tag, name: asset.name, date: asset.warrantyUntil })
      .from(asset)
      .where(and(ne(asset.status, "retired"), gte(asset.warrantyUntil, today), lte(asset.warrantyUntil, until)))
      .orderBy(asc(asset.warrantyUntil)),
    db
      .select({ id: licence.id, name: licence.name, date: licence.renewsOn, seats: licence.seats })
      .from(licence)
      .where(and(eq(licence.archived, false), lte(licence.renewsOn, until)))
      .orderBy(asc(licence.renewsOn)),
    listStock({ lowOnly: true }),
    upcomingChanges(now, 14),
  ]);
  return {
    warranties: w.map((x) => ({ ...x, date: x.date!, days: daysBetween(today, x.date!) })),
    licences: l.map((x) => ({ ...x, date: x.date!, days: daysBetween(today, x.date!) })),
    lowStock: s.map((x) => ({ id: x.id, name: x.name, quantity: x.quantity, minQuantity: x.minQuantity })),
    people,
  };
}

const when = (days: number) => (days < 0 ? `${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);

/**
 * Sends one summary a day (email to the IT team, and Slack if connected).
 * Safe to call more often: it only sends once per UK day, and nothing when there's nothing to say.
 */
export async function sendDailyReminders(now = new Date()) {
  const today = ukToday(now);
  const last = await db.query.appSetting.findFirst({ where: eq(appSetting.key, "lastReminderDay") });
  if (last?.value === today) return { sent: false, reason: "already sent today" };

  const c = await comingUp(now, 14);
  // Only mention a warranty or licence at 14, 7 and 1 days out, and on the day (or if overdue for renewal).
  const soon = (d: number) => d <= 1 || d === 7 || d === 14;
  const warranties = c.warranties.filter((x) => soon(x.days));
  const licences = c.licences.filter((x) => soon(x.days) || x.days < 0);
  // Starters and leavers with work left: a week before, the day before, on the day, and every day after.
  const people = c.people.filter((x) => x.done < x.total && (x.days <= 1 || x.days === 7));
  const lines = [
    ...people.map((x) => `${x.kind === "starter" ? "Starter" : "Leaver"} ${x.name} ${x.kind === "starter" ? "starts" : "leaves"} ${when(x.days)}: ${x.total - x.done} of ${x.total} jobs left`),
    ...licences.map((x) => `Licence ${x.days < 0 ? "was due to renew" : "renews"} ${when(x.days)}: ${x.name} (${x.date})`),
    ...warranties.map((x) => `Warranty ends ${when(x.days)}: ${x.tag} ${x.name} (${x.date})`),
    ...c.lowStock.map((x) => `Low stock: ${x.name}, ${x.quantity} left (minimum ${x.minQuantity})`),
  ];
  await db
    .insert(appSetting)
    .values({ key: "lastReminderDay", value: today })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: today, updatedAt: new Date() } });
  if (lines.length === 0) return { sent: false, reason: "nothing to report" };

  const it = await db.select({ email: user.email }).from(user).where(sql`${user.role} in ('tech','admin')`);
  await sendMail({
    to: it.map((r) => r.email),
    subject: `IT Hub reminders for ${today}`,
    text: `${lines.map((l) => `- ${l}`).join("\n")}\n\n${link("/it")}`,
  });
  if (slackMode() !== "off") {
    await postToChannel({
      text: `IT Hub reminders: ${lines.length} thing${lines.length === 1 ? "" : "s"} coming up`,
      blocks: [{ type: "section", text: { type: "mrkdwn", text: `*Coming up*\n${lines.map((l) => `• ${esc(l)}`).join("\n")}` } }],
    });
  }
  return { sent: true, lines };
}
