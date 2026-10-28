"use server";
import { revalidatePath } from "next/cache";
import { importAssets, importStock, type ImportResult } from "@/lib/csv-import";
import { requireIT } from "@/lib/session";

export type ImportState = { error?: string; result?: ImportResult; committed?: boolean; csv?: string; kind?: string } | undefined;

const MAX = 2 * 1024 * 1024;

export async function runImport(_: ImportState, form: FormData): Promise<ImportState> {
  const u = await requireIT();
  const kind = form.get("kind") === "stock" ? "stock" : "assets";
  const commit = form.get("go") === "import";
  let csv = String(form.get("csv") ?? "");
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX) return { error: "That file is over 2 MB. Split it into smaller files." };
    if (/\.xlsx?$/i.test(file.name)) return { error: "That's an Excel file. In Excel choose File → Save As → CSV (Comma delimited), then upload the .csv." };
    csv = await file.text();
  }
  if (!csv.trim()) return { error: "Choose a CSV file, or paste the rows into the box." };
  const result = kind === "stock" ? await importStock(u, csv, commit) : await importAssets(u, csv, commit);
  if (result.missing.length) return { error: "The first row needs column names, including a Name column. Download the template to see the layout.", csv, kind };
  if (commit) {
    revalidatePath("/it/assets");
    revalidatePath("/it/stock");
  }
  return { result, committed: commit, csv, kind };
}
