"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AssetError } from "@/lib/assets";
import { addKitTask, addTask, createChange, isChangeKind, PeopleError, removeTask, setChangeStatus, setTaskDone, updateChange } from "@/lib/people";
import { requireIT } from "@/lib/session";

export type PeopleState = { error?: string; ok?: string } | undefined;

const text = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

function details(form: FormData) {
  return {
    name: text(form, "name", 120),
    email: text(form, "email", 200),
    userId: text(form, "userId") || null,
    jobTitle: text(form, "jobTitle", 120),
    siteId: Number(form.get("siteId")) || null,
    manager: text(form, "manager", 120),
    date: text(form, "date", 10),
    notes: text(form, "notes", 2000),
  };
}

async function attempt(fn: () => Promise<unknown>): Promise<PeopleState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof PeopleError || e instanceof AssetError) return { error: e.message };
    throw e;
  }
  return undefined;
}

export async function createChangeAction(_: PeopleState, form: FormData): Promise<PeopleState> {
  const u = await requireIT();
  const kind = text(form, "kind");
  if (!isChangeKind(kind)) return { error: "Choose starter or leaver." };
  let id = 0;
  const kit = form.getAll("kit").map(Number).filter(Boolean);
  const res = await attempt(async () => {
    id = (await createChange(u, { kind, ...details(form) }, kit)).id;
  });
  if (res?.error) return res;
  revalidatePath("/it/people");
  revalidatePath("/it");
  redirect(`/it/people/${id}`);
}

export async function updateChangeAction(_: PeopleState, form: FormData): Promise<PeopleState> {
  const u = await requireIT();
  const id = Number(form.get("id"));
  const res = await attempt(() => updateChange(u, id, details(form)));
  if (res?.error) return res;
  revalidatePath(`/it/people/${id}`);
  revalidatePath("/it/people");
  return { ok: "Saved" };
}

export async function toggleTaskAction(_: PeopleState, form: FormData): Promise<PeopleState> {
  const u = await requireIT();
  const res = await attempt(() => setTaskDone(u, Number(form.get("taskId")), form.get("done") === "1"));
  revalidatePath(`/it/people/${Number(form.get("changeId"))}`);
  revalidatePath("/it/people");
  revalidatePath("/it");
  return res;
}

export async function addTaskAction(_: PeopleState, form: FormData): Promise<PeopleState> {
  const u = await requireIT();
  const changeId = Number(form.get("changeId"));
  const assetId = Number(form.get("assetId"));
  const res = await attempt(() => (assetId ? addKitTask(u, changeId, assetId) : addTask(u, changeId, text(form, "title"))));
  revalidatePath(`/it/people/${changeId}`);
  return res;
}

export async function removeTaskAction(_: PeopleState, form: FormData): Promise<PeopleState> {
  const u = await requireIT();
  const res = await attempt(() => removeTask(u, Number(form.get("taskId"))));
  revalidatePath(`/it/people/${Number(form.get("changeId"))}`);
  return res;
}

export async function setStatusAction(form: FormData) {
  const u = await requireIT();
  const id = Number(form.get("id"));
  await setChangeStatus(u, id, form.get("status") === "cancelled" ? "cancelled" : "open");
  revalidatePath(`/it/people/${id}`);
  revalidatePath("/it/people");
  revalidatePath("/it");
}
