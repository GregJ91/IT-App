"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteArticle, HelpError, saveArticle, saveHelpImage } from "@/lib/help";
import { requireIT } from "@/lib/session";
import { UploadError } from "@/lib/storage";

export type HelpState = { error?: string; ok?: string } | undefined;

export async function saveArticleAction(_: HelpState, form: FormData): Promise<HelpState> {
  const u = await requireIT();
  const id = Number(form.get("id")) || null;
  let saved;
  try {
    saved = await saveArticle(u, id, {
      title: String(form.get("title") ?? "").trim().slice(0, 140),
      summary: String(form.get("summary") ?? "").trim().slice(0, 240),
      body: String(form.get("body") ?? "").slice(0, 50_000),
      categoryId: Number(form.get("categoryId")) || null,
      published: form.get("published") === "on",
    });
  } catch (e) {
    if (e instanceof HelpError) return { error: e.message };
    throw e;
  }
  revalidatePath("/it/help");
  revalidatePath("/my/help");
  if (!id) redirect(`/it/help/${saved.id}?saved=1`);
  revalidatePath(`/it/help/${id}`);
  return { ok: saved.published ? "Saved and published." : "Saved as a draft. Staff can't see it yet." };
}

export async function deleteArticleAction(form: FormData) {
  const u = await requireIT();
  await deleteArticle(u, Number(form.get("id")));
  revalidatePath("/it/help");
  revalidatePath("/my/help");
  redirect("/it/help");
}

/** Uploads a screenshot and returns the Markdown to insert. */
export async function uploadHelpImage(form: FormData): Promise<{ markdown?: string; error?: string }> {
  const u = await requireIT();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose an image first." };
  try {
    const img = await saveHelpImage(u, file);
    const alt = file.name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "") || "Screenshot";
    return { markdown: `![${alt}](/api/help-images/${img.id})` };
  } catch (e) {
    if (e instanceof UploadError || e instanceof HelpError) return { error: e.message };
    throw e;
  }
}
