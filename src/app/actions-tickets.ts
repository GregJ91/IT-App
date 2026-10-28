"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { config } from "@/lib/config";
import { isITRole, requireIT, requireUser } from "@/lib/session";
import { UploadError } from "@/lib/storage";
import { addMessage, createTicket, logTime, rateTicket, TicketError, updateTicket } from "@/lib/tickets";
import { isStatus } from "@/lib/tickets-shared";

export type ActionState = { error?: string; ok?: string } | undefined;

const optionalId = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().positive().nullable());

const NewTicket = z.object({
  title: z.string().trim().min(3, "Give it a short title (at least 3 letters).").max(160),
  description: z.string().trim().min(1, "Add some details so IT knows what's wrong.").max(10000),
  priority: z.coerce.number().int().min(1).max(4),
  categoryId: optionalId,
  siteId: optionalId,
  location: z.string().trim().max(200),
  contactPhone: z.string().trim().max(40),
});

function files(form: FormData) {
  const list = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (list.length > config.maxUploadsPerTicket) throw new UploadError(`Add up to ${config.maxUploadsPerTicket} images at a time.`);
  return list;
}

function failure(e: unknown): ActionState {
  if (e instanceof TicketError || e instanceof UploadError) return { error: e.message };
  // Let Next.js redirects through.
  throw e;
}

export async function raiseTicket(_: ActionState, form: FormData): Promise<ActionState> {
  const u = await requireUser();
  const parsed = NewTicket.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let id: number;
  try {
    id = (await createTicket(u, parsed.data, files(form))).id;
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/my");
  revalidatePath("/it", "layout");
  redirect(isITRole(u.role) ? `/it/tickets/${id}` : `/my/${id}?new=1`);
}

export async function replyToTicket(_: ActionState, form: FormData): Promise<ActionState> {
  const u = await requireUser();
  const id = Number(form.get("ticketId"));
  const body = String(form.get("body") ?? "").slice(0, 10000);
  const internal = form.get("internal") === "1";
  try {
    if (isITRole(u.role)) await requireIT();
    await addMessage(id, u, body, internal, files(form));
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/my/${id}`);
  revalidatePath(`/it/tickets/${id}`);
  return { ok: internal ? "Note added" : "Sent" };
}

export async function changeTicket(form: FormData) {
  const u = await requireIT();
  const id = Number(form.get("ticketId"));
  const patch: Parameters<typeof updateTicket>[2] = {};
  const status = form.get("status");
  if (typeof status === "string" && isStatus(status)) patch.status = status;
  if (form.has("assigneeId")) patch.assigneeId = String(form.get("assigneeId")) || null;
  if (form.has("priority")) patch.priority = Number(form.get("priority"));
  if (form.has("categoryId")) patch.categoryId = Number(form.get("categoryId")) || null;
  if (form.has("siteId")) patch.siteId = Number(form.get("siteId")) || null;
  await updateTicket(id, u, patch);
  revalidatePath(`/it/tickets/${id}`);
  revalidatePath("/it", "layout");
}

export async function logTimeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const u = await requireIT();
  const id = Number(form.get("ticketId"));
  const minutes = Math.round(Number(form.get("hours") || 0) * 60 + Number(form.get("minutes") || 0));
  try {
    await logTime(id, u, minutes, String(form.get("note") ?? "").slice(0, 500));
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/it/tickets/${id}`);
  return { ok: "Time logged" };
}

export async function rateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const u = await requireUser();
  const id = Number(form.get("ticketId"));
  try {
    await rateTicket(id, u, Number(form.get("rating")), String(form.get("comment") ?? "").slice(0, 1000));
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/my/${id}`);
  return { ok: "Thanks for the feedback" };
}
