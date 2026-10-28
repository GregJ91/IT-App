import { and, asc, desc, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { link, sendMail } from "./notify";
import type { Actor } from "./roles";
import { isITRole } from "./roles";
import { esc, postToChannel, slackMode } from "./slack";

const { stockItem, stockMovement, site, user } = schema;

export class StockError extends Error {}

const requireIT = (actor: Actor) => {
  if (!isITRole(actor.role)) throw new StockError("Only the IT team can change stock.");
};

export const STOCK_PREFIX = "ST-";

export async function nextStockCode() {
  const [row] = await db
    .select({ max: sql<number | null>`max(nullif(regexp_replace(${stockItem.code}, '\\D', '', 'g'), '')::int)` })
    .from(stockItem)
    .where(ilike(stockItem.code, `${STOCK_PREFIX}%`));
  return `${STOCK_PREFIX}${String((row?.max ?? 0) + 1).padStart(4, "0")}`;
}

export const isLow = (i: { quantity: number; minQuantity: number }) => i.minQuantity > 0 && i.quantity < i.minQuantity;

export type StockInput = {
  name: string;
  category: string;
  siteId: number | null;
  location: string;
  minQuantity: number;
  supplier: string;
  fits: string;
  notes: string;
};

export async function createStockItem(actor: Actor, input: StockInput, quantity: number) {
  requireIT(actor);
  if (!Number.isInteger(quantity) || quantity < 0) throw new StockError("Starting quantity must be 0 or more.");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [row] = await db.insert(stockItem).values({ ...input, quantity, code: await nextStockCode() }).returning();
      if (quantity > 0) {
        await db.insert(stockMovement).values({ itemId: row.id, delta: quantity, quantityAfter: quantity, reason: "counted", note: "Starting stock", userId: actor.id });
      }
      return row;
    } catch (e) {
      const err = e as { code?: string; cause?: { code?: string } };
      if (err?.code !== "23505" && err?.cause?.code !== "23505") throw e;
    }
  }
  throw new StockError("Couldn't pick a code. Try again.");
}

export async function updateStockItem(actor: Actor, id: number, input: StockInput) {
  requireIT(actor);
  const [row] = await db.update(stockItem).set({ ...input, updatedAt: new Date() }).where(eq(stockItem.id, id)).returning();
  if (!row) throw new StockError("Item not found.");
  return row;
}

/**
 * Takes out (negative) or adds (positive) stock in one safe step, so two people
 * taking the last one at the same moment can't take it twice.
 * "counted" sets the quantity to an exact number after a stock check.
 */
export async function moveStock(
  actor: Actor,
  id: number,
  change: { delta: number; reason: "taken" | "received" } | { count: number; reason: "counted" },
  note = "",
  ticketId: number | null = null,
) {
  requireIT(actor);
  const before = await db.query.stockItem.findFirst({ where: eq(stockItem.id, id) });
  if (!before) throw new StockError("Item not found.");

  let row: typeof stockItem.$inferSelect | undefined;
  let delta: number;
  if (change.reason === "counted") {
    if (!Number.isInteger(change.count) || change.count < 0) throw new StockError("Enter the number on the shelf (0 or more).");
    [row] = await db.update(stockItem).set({ quantity: change.count, updatedAt: new Date() }).where(eq(stockItem.id, id)).returning();
    delta = change.count - before.quantity;
  } else {
    if (!Number.isInteger(change.delta) || change.delta === 0) throw new StockError("Enter how many.");
    if (change.reason === "taken" && change.delta > 0) change.delta = -change.delta;
    delta = change.delta;
    [row] = await db
      .update(stockItem)
      .set({ quantity: sql`${stockItem.quantity} + ${delta}`, updatedAt: new Date() })
      .where(and(eq(stockItem.id, id), sql`${stockItem.quantity} + ${delta} >= 0`))
      .returning();
    if (!row) {
      const now = await db.query.stockItem.findFirst({ where: eq(stockItem.id, id) });
      throw new StockError(`Only ${now?.quantity ?? 0} left, so you can't take ${-delta}.`);
    }
  }
  await db.insert(stockMovement).values({ itemId: id, delta, quantityAfter: row!.quantity, reason: change.reason, note: note.trim(), ticketId, userId: actor.id });

  // Tell IT once, at the moment it drops below the minimum.
  if (isLow(row!) && !isLow(before)) await lowStockAlert(row!, actor);
  return row!;
}

async function lowStockAlert(item: typeof stockItem.$inferSelect, actor: Actor) {
  const where = item.siteId ? (await db.query.site.findFirst({ where: eq(site.id, item.siteId) }))?.name : null;
  const place = [where, item.location].filter(Boolean).join(", ");
  const it = await db.select({ email: user.email }).from(user).where(sql`${user.role} in ('tech','admin')`);
  const url = link(`/it/stock/${item.id}`);
  await sendMail({
    to: it.map((r) => r.email),
    subject: `Low stock: ${item.name} (${item.quantity} left)`,
    text: `${actor.name} just took one, leaving ${item.quantity} of ${item.name}. The minimum is ${item.minQuantity}.\n${place ? `Kept at: ${place}\n` : ""}${item.supplier ? `Supplier: ${item.supplier}\n` : ""}\n${url}`,
  });
  if (slackMode() !== "off") {
    await postToChannel({
      text: `Low stock: ${item.name}, ${item.quantity} left (minimum ${item.minQuantity})`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*Low stock:* <${url}|${esc(item.name)}>\n${item.quantity} left, minimum ${item.minQuantity}${place ? ` · ${esc(place)}` : ""}${item.supplier ? ` · reorder from ${esc(item.supplier)}` : ""}` } },
      ],
    });
  }
}

export type StockListItem = Awaited<ReturnType<typeof listStock>>[number];

export async function listStock(opts: { q?: string; lowOnly?: boolean; siteId?: number | null } = {}) {
  const where: SQL[] = [eq(stockItem.archived, false)];
  if (opts.lowOnly) where.push(sql`${stockItem.minQuantity} > 0`, lt(stockItem.quantity, stockItem.minQuantity));
  if (opts.siteId) where.push(eq(stockItem.siteId, opts.siteId));
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    where.push(or(ilike(stockItem.name, q), ilike(stockItem.code, q), ilike(stockItem.category, q), ilike(stockItem.fits, q), ilike(stockItem.location, q))!);
  }
  return db
    .select({
      id: stockItem.id,
      code: stockItem.code,
      name: stockItem.name,
      category: stockItem.category,
      quantity: stockItem.quantity,
      minQuantity: stockItem.minQuantity,
      location: stockItem.location,
      fits: stockItem.fits,
      supplier: stockItem.supplier,
      siteId: stockItem.siteId,
      siteName: site.name,
    })
    .from(stockItem)
    .leftJoin(site, eq(site.id, stockItem.siteId))
    .where(and(...where))
    .orderBy(sql`case when ${stockItem.minQuantity} > 0 and ${stockItem.quantity} < ${stockItem.minQuantity} then 0 else 1 end`, asc(stockItem.category), asc(stockItem.name));
}

export async function getStockItem(id: number) {
  const item = await db.query.stockItem.findFirst({ where: eq(stockItem.id, id) });
  if (!item) return null;
  const [siteRow, moves] = await Promise.all([
    item.siteId ? db.query.site.findFirst({ where: eq(site.id, item.siteId) }) : null,
    db
      .select({ id: stockMovement.id, delta: stockMovement.delta, quantityAfter: stockMovement.quantityAfter, reason: stockMovement.reason, note: stockMovement.note, ticketId: stockMovement.ticketId, createdAt: stockMovement.createdAt, userName: user.name })
      .from(stockMovement)
      .leftJoin(user, eq(user.id, stockMovement.userId))
      .where(eq(stockMovement.itemId, id))
      .orderBy(desc(stockMovement.createdAt), desc(stockMovement.id))
      .limit(50),
  ]);
  return { item, site: siteRow ?? null, moves };
}

export async function findStockByCode(code: string) {
  return (await db.query.stockItem.findFirst({ where: eq(stockItem.code, code.trim().toUpperCase()) })) ?? null;
}

export async function archiveStockItem(actor: Actor, id: number) {
  requireIT(actor);
  await db.update(stockItem).set({ archived: true, updatedAt: new Date() }).where(eq(stockItem.id, id));
}

/** Toner and other stock whose "Fits" mentions this model, e.g. "LaserJet M507". */
export async function stockFitting(model: string) {
  const m = model.trim();
  if (m.length < 3) return [];
  return db
    .select({ id: stockItem.id, name: stockItem.name, quantity: stockItem.quantity, minQuantity: stockItem.minQuantity })
    .from(stockItem)
    .where(and(eq(stockItem.archived, false), ilike(stockItem.fits, `%${m.replace(/[%_\\]/g, "")}%`)))
    .orderBy(asc(stockItem.name));
}

/** Categories for the add/edit form: the usual ones plus any already in use. */
export async function stockCategories() {
  const rows = await db.selectDistinct({ c: stockItem.category }).from(stockItem).where(sql`${stockItem.category} <> ''`);
  return [...new Set(["Toner", "Labels", "Peripherals", "Screens", "Cables", ...rows.map((r) => r.c)])].sort();
}
