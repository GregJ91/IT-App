"use server";
import { revalidatePath } from "next/cache";
import { pollAll } from "@/lib/network/poll";
import { requireIT } from "@/lib/session";

export type RefreshState = { ok?: string; error?: string } | undefined;

export async function refreshNow(_: RefreshState): Promise<RefreshState> {
  await requireIT();
  const results = (await pollAll()) as { name: string; ok: boolean; error?: string }[];
  revalidatePath("/it/network", "layout");
  const bad = results.filter((r) => !r.ok);
  if (results.length === 0) return { error: "No UniFi connections are set up yet." };
  return bad.length ? { error: bad.map((b) => `${b.name}: ${b.error}`).join(" ") } : { ok: "Up to date" };
}
