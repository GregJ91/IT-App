"use server";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { createInvite, inviteUrl, reissueInvite, revokeInvite } from "@/lib/invites";
import { sendMail } from "@/lib/notify";
import { sendTestMessage } from "@/lib/slack";
import { validHours } from "@/lib/calendar";
import { recomputeOpenTickets, saveSlaSettings } from "@/lib/sla-rules";
import { pollConnection, readSource, saveNetSettings } from "@/lib/network/poll";
import { encryptSecret } from "@/lib/network/secret";
import { SourceError } from "@/lib/network/types";
import { requireAdmin } from "@/lib/session";

export type SettingsState = { error?: string; ok?: string; link?: string } | undefined;

const done = (ok: string, extra: Partial<NonNullable<SettingsState>> = {}): SettingsState => {
  revalidatePath("/it/settings");
  return { ok, ...extra };
};

/* ---------- IT team ---------- */

const InviteInput = z.object({
  name: z.string().trim().min(1, "Add their name.").max(100),
  email: z.string().trim().toLowerCase().email("That email address doesn't look right."),
  role: z.enum(["tech", "admin"]),
});

export async function sendInvite(_: SettingsState, form: FormData): Promise<SettingsState> {
  const admin = await requireAdmin();
  const parsed = InviteInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const existing = await db.query.user.findFirst({ where: eq(schema.user.email, parsed.data.email) });
  if (existing && (existing.role === "tech" || existing.role === "admin")) return { error: `${parsed.data.email} is already in the IT team.` };
  const { token } = await createInvite({ ...parsed.data, invitedById: admin.id });
  const url = inviteUrl(token);
  await sendMail({
    to: parsed.data.email,
    subject: `${admin.name} invited you to the Gardeners Dream IT team`,
    text: `Hi ${parsed.data.name},\n\n${admin.name} has invited you to IT Hub as ${parsed.data.role === "admin" ? "an IT admin" : "an IT tech"}.\n\nOpen this link on your phone or computer to set up your account. It works once and expires in 7 days:\n${url}\n`,
  });
  return done(`Invite sent to ${parsed.data.email}`, { link: url });
}

export async function newInviteLink(_: SettingsState, form: FormData): Promise<SettingsState> {
  const admin = await requireAdmin();
  const res = await reissueInvite(Number(form.get("id")), admin.id);
  if (!res) return { error: "That invite has already been used." };
  const url = inviteUrl(res.token);
  await sendMail({ to: res.invite.email, subject: `Your new IT Hub invite link`, text: `Here's a fresh link (the old one no longer works):\n${url}\n` });
  return done(`New link sent to ${res.invite.email}. The old one no longer works.`, { link: url });
}

export async function cancelInvite(form: FormData) {
  await requireAdmin();
  await revokeInvite(Number(form.get("id")));
  revalidatePath("/it/settings");
}

export async function changeRole(_: SettingsState, form: FormData): Promise<SettingsState> {
  const admin = await requireAdmin();
  const userId = String(form.get("userId"));
  const role = String(form.get("role"));
  if (!["staff", "tech", "admin"].includes(role)) return { error: "Unknown role." };
  if (userId === admin.id && role !== "admin") return { error: "You can't remove your own admin access. Ask another admin." };
  if (role === "staff") {
    // Unassign their open work so nothing falls through the cracks.
    await db
      .update(schema.ticket)
      .set({ assigneeId: null })
      .where(and(eq(schema.ticket.assigneeId, userId), inArray(schema.ticket.status, ["new", "progress", "waiting"])));
  }
  await db.update(schema.user).set({ role, updatedAt: new Date() }).where(eq(schema.user.id, userId));
  if (role === "staff") {
    // Sign them out everywhere so the IT view goes away straight away.
    await db.delete(schema.session).where(eq(schema.session.userId, userId));
  }
  return done(role === "staff" ? "Removed from the IT team. Their open jobs are now unassigned." : "Role updated.");
}

/* ---------- assignment rules ---------- */

const optId = (v: FormDataEntryValue | null) => (v ? Number(v) || null : null);

export async function addRule(form: FormData) {
  await requireAdmin();
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${schema.assignmentRule.position}), 0)` }).from(schema.assignmentRule);
  await db.insert(schema.assignmentRule).values({
    categoryId: optId(form.get("categoryId")),
    siteId: optId(form.get("siteId")),
    assigneeId: String(form.get("assigneeId") || "") || null,
    position: Number(max) + 10,
  });
  revalidatePath("/it/settings");
}

export async function deleteRule(form: FormData) {
  await requireAdmin();
  await db.delete(schema.assignmentRule).where(eq(schema.assignmentRule.id, Number(form.get("id"))));
  revalidatePath("/it/settings");
}

export async function moveRule(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const dir = form.get("dir") === "up" ? -1 : 1;
  const rules = await db.select().from(schema.assignmentRule).orderBy(schema.assignmentRule.position, schema.assignmentRule.id);
  const i = rules.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rules.length) return;
  [rules[i], rules[j]] = [rules[j], rules[i]];
  await db.transaction(async (tx) => {
    for (const [n, r] of rules.entries()) await tx.update(schema.assignmentRule).set({ position: (n + 1) * 10 }).where(eq(schema.assignmentRule.id, r.id));
  });
  revalidatePath("/it/settings");
}

/* ---------- SLA ---------- */

const UNIT: Record<string, number> = { min: 1, hours: 60, days: 60 * 24 };

export async function saveSla(_: SettingsState, form: FormData): Promise<SettingsState> {
  await requireAdmin();
  const rows = await db.select().from(schema.slaPolicy);
  for (const r of rows) {
    const resp = Number(form.get(`r${r.priority}`)) * (UNIT[String(form.get(`ru${r.priority}`))] ?? 1);
    const res = Number(form.get(`f${r.priority}`)) * (UNIT[String(form.get(`fu${r.priority}`))] ?? 1);
    if (!(resp > 0) || !(res > 0)) return { error: `Enter times above zero for P${r.priority}.` };
    if (res < resp) return { error: `P${r.priority}: fixing can't be due before the first response.` };
    const counts = form.get(`c${r.priority}`) === "hours" ? "hours" : "any";
    await db
      .update(schema.slaPolicy)
      .set({ responseMinutes: Math.round(resp), resolveMinutes: Math.round(res), counts })
      .where(eq(schema.slaPolicy.priority, r.priority));
  }
  const n = await recomputeOpenTickets();
  return done(`SLA targets saved. Deadlines on ${n} open job${n === 1 ? "" : "s"} have been updated.`);
}

export async function saveWorkingHours(_: SettingsState, form: FormData): Promise<SettingsState> {
  await requireAdmin();
  const hours = {
    start: String(form.get("start") ?? ""),
    end: String(form.get("end") ?? ""),
    days: form.getAll("days").map(Number).sort(),
  };
  if (!validHours(hours)) return { error: "Pick a start and finish time (finish after start) and at least one day." };
  if (hours.days.length === 0) return { error: "Pick at least one day." };
  await saveSlaSettings({ hours, pauseWhileWaiting: form.get("pause") === "on" });
  const n = await recomputeOpenTickets();
  return done(`Saved. Deadlines on ${n} open job${n === 1 ? "" : "s"} have been updated.`);
}

/* ---------- sites and categories ---------- */

const tables = { site: schema.site, category: schema.category, type: schema.assetType } as const;
type Kind = keyof typeof tables;
const kindOf = (v: FormDataEntryValue | null): Kind => (v === "category" ? "category" : v === "type" ? "type" : "site");

export async function addListItem(_: SettingsState, form: FormData): Promise<SettingsState> {
  await requireAdmin();
  const kind = kindOf(form.get("kind"));
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { error: "Type a name first." };
  const t = tables[kind];
  const clash = await db.select().from(t).where(sql`lower(${t.name}) = lower(${name})`);
  if (clash.length) {
    if (clash[0].archived) {
      await db.update(t).set({ archived: false }).where(eq(t.id, clash[0].id));
      return done(`${name} is back.`);
    }
    return { error: `${name} is already on the list.` };
  }
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${t.position}), 0)` }).from(t);
  // New kit types with "print" or "scan" in the name show on the Printers page.
  await db.insert(t).values({ name, position: Number(max) + 1, ...(t === schema.assetType ? { isPrinter: /print|scan/i.test(name) } : {}) });
  return done(`Added ${name}.`);
}

export async function renameListItem(_: SettingsState, form: FormData): Promise<SettingsState> {
  await requireAdmin();
  const t = tables[kindOf(form.get("kind"))];
  const id = Number(form.get("id"));
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { error: "Names can't be empty." };
  const clash = await db.select().from(t).where(and(sql`lower(${t.name}) = lower(${name})`, ne(t.id, id)));
  if (clash.length) return { error: `${name} is already on the list.` };
  await db.update(t).set({ name }).where(eq(t.id, id));
  return done("Saved.");
}

export async function archiveListItem(form: FormData) {
  await requireAdmin();
  const t = tables[kindOf(form.get("kind"))];
  await db.update(t).set({ archived: true }).where(eq(t.id, Number(form.get("id"))));
  revalidatePath("/it/settings");
}


/* ---------- Slack ---------- */

export async function testSlack(_: SettingsState): Promise<SettingsState> {
  const admin = await requireAdmin();
  const res = await sendTestMessage(admin.name);
  return res.ok ? { ok: res.detail } : { error: res.detail };
}

/* ---------- Network (UniFi) ---------- */

export async function addNetConnection(_: SettingsState, form: FormData): Promise<SettingsState> {
  await requireAdmin();
  const kind = String(form.get("kind"));
  if (!["console", "cloud", "example"].includes(kind)) return { error: "Choose what you're connecting." };
  const name = String(form.get("name") ?? "").trim().slice(0, 80) || (kind === "example" ? "Example network" : kind === "cloud" ? "UniFi cloud" : "UniFi console");
  const url = kind === "example" ? "" : String(form.get("url") ?? "").trim().slice(0, 300);
  const apiKey = kind === "example" ? "" : String(form.get("apiKey") ?? "").trim();
  const trustCert = kind === "console" && form.get("trustCert") === "on";
  if (kind === "console" && !url) return { error: "Add the console's address, e.g. https://192.168.1.1" };
  if (kind !== "example" && !apiKey) return { error: "Paste the API key from UniFi." };
  // Check it works before saving, so a typo doesn't sit there failing quietly.
  try {
    const snap = await readSource({ kind: kind as "console" | "cloud" | "example", url, apiKey, trustCert });
    const [row] = await db.insert(schema.netConnection).values({ name, kind, url, apiKeyEnc: encryptSecret(apiKey), trustCert }).returning();
    await pollConnection(row);
    revalidatePath("/it/network", "layout");
    return done(`Connected to ${name}: found ${snap.sites.length} site${snap.sites.length === 1 ? "" : "s"} and ${snap.sites.reduce((n, s) => n + s.devices.length, 0)} pieces of UniFi kit.`);
  } catch (e) {
    if (e instanceof SourceError) return { error: e.message };
    throw e;
  }
}

export async function checkNetConnection(_: SettingsState, form: FormData): Promise<SettingsState> {
  await requireAdmin();
  const conn = await db.query.netConnection.findFirst({ where: eq(schema.netConnection.id, Number(form.get("id"))) });
  if (!conn) return { error: "Connection not found." };
  const r = await pollConnection(conn);
  revalidatePath("/it/network", "layout");
  revalidatePath("/it/settings");
  return r.ok ? { ok: `Working: ${r.sites} site${r.sites === 1 ? "" : "s"} updated.` } : { error: r.error };
}

export async function updateNetConnection(_: SettingsState, form: FormData): Promise<SettingsState> {
  await requireAdmin();
  const id = Number(form.get("id"));
  const conn = await db.query.netConnection.findFirst({ where: eq(schema.netConnection.id, id) });
  if (!conn) return { error: "Connection not found." };
  const url = String(form.get("url") ?? conn.url).trim();
  const newKey = String(form.get("apiKey") ?? "").trim();
  const trustCert = conn.kind === "console" && form.get("trustCert") === "on";
  await db
    .update(schema.netConnection)
    .set({ url, trustCert, ...(newKey ? { apiKeyEnc: encryptSecret(newKey) } : {}) })
    .where(eq(schema.netConnection.id, id));
  const r = await pollConnection({ ...conn, url, trustCert, apiKeyEnc: newKey ? encryptSecret(newKey) : conn.apiKeyEnc });
  revalidatePath("/it/network", "layout");
  return r.ok ? done("Saved and working.") : { error: `Saved, but: ${r.error}` };
}

export async function toggleNetConnection(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const conn = await db.query.netConnection.findFirst({ where: eq(schema.netConnection.id, id) });
  if (conn) await db.update(schema.netConnection).set({ enabled: !conn.enabled }).where(eq(schema.netConnection.id, id));
  revalidatePath("/it/settings");
  revalidatePath("/it/network", "layout");
}

export async function removeNetConnection(form: FormData) {
  await requireAdmin();
  await db.delete(schema.netConnection).where(eq(schema.netConnection.id, Number(form.get("id"))));
  revalidatePath("/it/settings");
  revalidatePath("/it/network", "layout");
}

export async function mapNetSite(form: FormData) {
  await requireAdmin();
  await db
    .update(schema.netSite)
    .set({ siteId: Number(form.get("siteId")) || null })
    .where(eq(schema.netSite.id, Number(form.get("netSiteId"))));
  revalidatePath("/it/settings");
  revalidatePath("/it/network", "layout");
}

export async function saveNetAlerts(_: SettingsState, form: FormData): Promise<SettingsState> {
  await requireAdmin();
  const minutes = Number(form.get("alertAfterMin"));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) return { error: "Choose between 1 and 120 minutes." };
  await saveNetSettings({ alertAfterMin: minutes, autoTicket: form.get("autoTicket") === "on", addKitToInventory: form.get("addKit") === "on" });
  return done("Saved.");
}
