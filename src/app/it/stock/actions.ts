"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireIT } from "@/lib/session";
import { archiveStockItem, createStockItem, moveStock, StockError, updateStockItem, type StockInput } from "@/lib/stock";

export type StockState = { error?: string; ok?: string } | undefined;

const text = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const whole = (f: FormData, k: string) => {
  const v = text(f, k);
  return v === "" ? 0 : Number(v);
};

function parse(form: FormData): StockInput {
  const name = text(form, "name", 160);
  if (!name) throw new StockError("Give it a name, e.g. HP 59A toner.");
  const min = whole(form, "minQuantity");
  if (!Number.isInteger(min) || min < 0) throw new StockError("Minimum must be a whole number, 0 or more.");
  return {
    name,
    category: text(form, "category", 60),
    siteId: Number(form.get("siteId")) || null,
    location: text(form, "location"),
    minQuantity: min,
    supplier: text(form, "supplier"),
    fits: text(form, "fits"),
    notes: text(form, "notes", 2000),
  };
}

export async function saveStockItem(_: StockState, form: FormData): Promise<StockState> {
  const u = await requireIT();
  const id = Number(form.get("id")) || null;
  let saved: number;
  try {
    const input = parse(form);
    if (id) saved = (await updateStockItem(u, id, input)).id;
    else {
      const qty = whole(form, "quantity");
      saved = (await createStockItem(u, input, qty)).id;
    }
  } catch (e) {
    if (e instanceof StockError) return { error: e.message };
    throw e;
  }
  revalidatePath("/it/stock");
  if (id) {
    revalidatePath(`/it/stock/${id}`);
    return { ok: "Saved" };
  }
  redirect(`/it/stock/${saved}`);
}

export async function moveStockAction(_: StockState, form: FormData): Promise<StockState> {
  const u = await requireIT();
  const id = Number(form.get("id"));
  const kind = text(form, "kind");
  const n = whole(form, "n") || (kind === "counted" ? 0 : 1);
  const ticketId = Number(text(form, "ticket").replace(/^it-/i, "")) || null;
  try {
    const row =
      kind === "counted"
        ? await moveStock(u, id, { count: n, reason: "counted" }, text(form, "note", 300), ticketId)
        : await moveStock(u, id, { delta: kind === "received" ? Math.abs(n) : -Math.abs(n), reason: kind === "received" ? "received" : "taken" }, text(form, "note", 300), ticketId);
    revalidatePath("/it/stock");
    revalidatePath(`/it/stock/${id}`);
    revalidatePath("/it");
    return { ok: `${row.quantity} left` };
  } catch (e) {
    if (e instanceof StockError) return { error: e.message };
    throw e;
  }
}

export async function archiveStockAction(form: FormData) {
  const u = await requireIT();
  await archiveStockItem(u, Number(form.get("id")));
  revalidatePath("/it/stock");
  redirect("/it/stock");
}
