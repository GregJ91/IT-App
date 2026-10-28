"use server";
import { revalidatePath } from "next/cache";
import { archiveLicence, LicenceError, saveLicence } from "@/lib/licences";
import { requireIT } from "@/lib/session";

export type LicenceState = { error?: string; ok?: string } | undefined;

const text = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

export async function saveLicenceAction(_: LicenceState, form: FormData): Promise<LicenceState> {
  const u = await requireIT();
  const seats = text(form, "seats");
  const cost = text(form, "cost").replace(/[£,\s]/g, "");
  if (seats && !/^\d+$/.test(seats)) return { error: "Seats must be a whole number." };
  if (cost && !/^\d+(\.\d{1,2})?$/.test(cost)) return { error: "Enter the cost as a number, e.g. 1250.00." };
  const renews = text(form, "renewsOn");
  try {
    await saveLicence(u, Number(form.get("id")) || null, {
      name: text(form, "name", 120),
      supplier: text(form, "supplier"),
      seats: seats ? Number(seats) : null,
      renewsOn: /^\d{4}-\d{2}-\d{2}$/.test(renews) ? renews : null,
      costPence: cost ? Math.round(parseFloat(cost) * 100) : null,
      notes: text(form, "notes", 1000),
    });
  } catch (e) {
    if (e instanceof LicenceError) return { error: e.message };
    throw e;
  }
  revalidatePath("/it/licences");
  revalidatePath("/it");
  return { ok: "Saved" };
}

export async function archiveLicenceAction(form: FormData) {
  const u = await requireIT();
  await archiveLicence(u, Number(form.get("id")));
  revalidatePath("/it/licences");
}
