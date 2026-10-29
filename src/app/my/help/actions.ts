"use server";
import { revalidatePath } from "next/cache";
import { recordFeedback, suggestArticles } from "@/lib/help";
import { requireUser } from "@/lib/session";

export async function suggestHelp(text: string) {
  await requireUser();
  return suggestArticles(String(text ?? "").slice(0, 400));
}

/** "Did this help?" on an article, or "This fixed it" while raising a job. */
export async function helpFeedbackAction(articleId: number, helpful: boolean, solvedJob = false) {
  const u = await requireUser();
  await recordFeedback(u.id, Number(articleId), !!helpful, !!solvedJob);
  revalidatePath("/it/help");
}
