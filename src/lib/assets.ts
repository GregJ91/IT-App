import { and, asc, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import type { Actor } from "./roles";
import { isITRole } from "./roles";
import { saveUpload } from "./storage";
import { OPEN_STATUSES } from "./tickets-shared";

const { asset, assetType, assetPhoto, assetEvent, site, user, ticket } = schema;

export class AssetError extends Error {}

export const ASSET_STATUSES = ["in_use", "spare", "repair", "retired"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  in_use: "In use",
  spare: "Spare",
  repair: "In repair",
  retired: "Retired",
};
export const isAssetStatus = (s: string): s is AssetStatus => (ASSET_STATUSES as readonly string[]).includes(s);

export const TAG_PREFIX = "GD-";

function requireIT(actor: Actor) {
  if (!isITRole(actor.role)) throw new AssetError("Only the IT team can change inventory.");
}

/** Next free tag: GD-00001, GD-00002… Tags are never reused, even after an asset is deleted. */
export async function nextTag() {
  const [row] = await db
    .select({ max: sql<number | null>`max(nullif(regexp_replace(${asset.tag}, '\\D', '', 'g'), '')::int)` })
    .from(asset)
    .where(ilike(asset.tag, `${TAG_PREFIX}%`));
  return `${TAG_PREFIX}${String((row?.max ?? 0) + 1).padStart(5, "0")}`;
}

/** Tags are typed by hand sometimes; normalise "gd 42" or "GD-42" to "GD-00042". */
export function normaliseTag(input: string) {
  const t = input.trim().toUpperCase();
  const m = t.match(/^GD[-\s]?0*(\d{1,7})$/);
  return m ? `${TAG_PREFIX}${m[1].padStart(5, "0")}` : t;
}

export type AssetInput = {
  name: string;
  typeId: number | null;
  make: string;
  model: string;
  serial: string;
  status: AssetStatus;
  siteId: number | null;
  location: string;
  ipAddress: string;
  macAddress: string;
  purchaseDate: string | null;
  purchaseCostPence: number | null;
  supplier: string;
  warrantyUntil: string | null;
  notes: string;
};

const FIELD_LABEL: Record<keyof AssetInput, string> = {
  name: "Name",
  typeId: "Type",
  make: "Make",
  model: "Model",
  serial: "Serial",
  status: "Status",
  siteId: "Site",
  location: "Location",
  ipAddress: "IP address",
  macAddress: "MAC address",
  purchaseDate: "Purchase date",
  purchaseCostPence: "Cost",
  supplier: "Supplier",
  warrantyUntil: "Warranty until",
  notes: "Notes",
};

/** "3c:52:82:1a:7f:04" or "3C-52-82-1A-7F-04" → "3C:52:82:1A:7F:04". Leaves anything else alone. */
export function normaliseMac(mac: string) {
  const hex = mac.replace(/[^0-9a-f]/gi, "");
  return hex.length === 12 ? hex.toUpperCase().match(/../g)!.join(":") : mac.trim();
}

export function checkNetwork(input: Pick<AssetInput, "ipAddress" | "macAddress">) {
  const ip = input.ipAddress.trim();
  if (ip && !/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(ip)) {
    throw new AssetError(`"${ip}" isn't an IP address like 10.20.1.31.`);
  }
  const mac = normaliseMac(input.macAddress);
  if (mac && !/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
    throw new AssetError(`"${input.macAddress}" isn't a MAC address like 3C:52:82:1A:7F:04.`);
  }
  return { ipAddress: ip, macAddress: mac };
}

async function savePhotos(assetId: number, files: File[], actorId: string) {
  for (const f of files) {
    const key = await saveUpload(f);
    await db.insert(assetPhoto).values({ assetId, uploadedById: actorId, filename: f.name.slice(0, 200) || "photo", mimeType: f.type, size: f.size, storageKey: key });
  }
}

/** Postgres "duplicate key" errors, whether or not the driver wraps them. */
export function isUniqueViolation(e: unknown) {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

export async function createAsset(actor: Actor, input: AssetInput, photos: File[] = [], tag?: string) {
  requireIT(actor);
  const net = checkNetwork(input);
  const wanted = tag?.trim() ? normaliseTag(tag) : null;
  if (wanted && (await db.query.asset.findFirst({ where: eq(asset.tag, wanted) }))) {
    throw new AssetError(`${wanted} is already used by another item.`);
  }
  // Two people adding kit at the same moment could pick the same tag; try again if so.
  for (let attempt = 0; attempt < 3; attempt++) {
    const t = wanted ?? (await nextTag());
    try {
      const [row] = await db.insert(asset).values({ ...input, ...net, tag: t }).returning();
      await db.insert(assetEvent).values({ assetId: row.id, actorId: actor.id, type: "created" });
      await savePhotos(row.id, photos, actor.id);
      return row;
    } catch (e) {
      if (wanted || !isUniqueViolation(e)) throw e;
    }
  }
  throw new AssetError("Couldn't pick a tag. Try again.");
}

export async function updateAsset(actor: Actor, id: number, input: AssetInput) {
  requireIT(actor);
  const before = await db.query.asset.findFirst({ where: eq(asset.id, id) });
  if (!before) throw new AssetError("Item not found.");
  const net = checkNetwork(input);
  const next = { ...input, ...net };
  const changed = (Object.keys(FIELD_LABEL) as (keyof AssetInput)[]).filter((k) => (before[k] ?? null) !== (next[k] ?? null));
  if (changed.length === 0) return before;
  const [row] = await db
    .update(asset)
    .set({ ...next, updatedAt: new Date(), ...(next.status === "retired" ? { assignedUserId: null, assignedTo: "" } : {}) })
    .where(eq(asset.id, id))
    .returning();
  await db.insert(assetEvent).values({
    assetId: id,
    actorId: actor.id,
    type: "edited",
    data: { fields: changed.map((k) => FIELD_LABEL[k]), ...(changed.includes("status") ? { status: { from: before.status, to: next.status } } : {}) },
  });
  return row;
}

/** Hand an item to a person (with an account) or a place/team. */
export async function checkOut(actor: Actor, id: number, to: { userId: string | null; name: string }, note = "") {
  requireIT(actor);
  const a = await db.query.asset.findFirst({ where: eq(asset.id, id) });
  if (!a) throw new AssetError("Item not found.");
  if (a.status === "retired") throw new AssetError("This item is retired. Change its status first.");
  let label = to.name.trim();
  if (to.userId) {
    const u = await db.query.user.findFirst({ where: eq(user.id, to.userId), columns: { name: true } });
    if (!u) throw new AssetError("That person wasn't found.");
    label = u.name;
  }
  if (!label) throw new AssetError("Choose a person or type who it's going to.");
  await db
    .update(asset)
    .set({ assignedUserId: to.userId, assignedTo: to.userId ? "" : label, status: "in_use", updatedAt: new Date() })
    .where(eq(asset.id, id));
  await db.insert(assetEvent).values({
    assetId: id,
    actorId: actor.id,
    type: "checked_out",
    data: { to: label, userId: to.userId, from: a.assignedTo || null, note: note.trim() },
  });
}

export async function checkIn(actor: Actor, id: number, where: { siteId: number | null; location: string }, note = "") {
  requireIT(actor);
  const a = await db.query.asset.findFirst({ where: eq(asset.id, id) });
  if (!a) throw new AssetError("Item not found.");
  const holder = a.assignedUserId
    ? (await db.query.user.findFirst({ where: eq(user.id, a.assignedUserId), columns: { name: true } }))?.name
    : a.assignedTo;
  await db
    .update(asset)
    .set({ assignedUserId: null, assignedTo: "", status: a.status === "retired" ? "retired" : "spare", siteId: where.siteId ?? a.siteId, location: where.location.trim() || a.location, updatedAt: new Date() })
    .where(eq(asset.id, id));
  await db.insert(assetEvent).values({
    assetId: id,
    actorId: actor.id,
    type: "checked_in",
    data: { from: holder || null, location: where.location.trim() || null, note: note.trim() },
  });
}

export async function addAssetPhotos(actor: Actor, id: number, files: File[]) {
  requireIT(actor);
  if (files.length === 0) throw new AssetError("Choose a photo first.");
  if (!(await db.query.asset.findFirst({ where: eq(asset.id, id) }))) throw new AssetError("Item not found.");
  await savePhotos(id, files, actor.id);
  await db.insert(assetEvent).values({ assetId: id, actorId: actor.id, type: "photo", data: { count: files.length } });
}

export async function deleteAssetPhoto(actor: Actor, photoId: number) {
  requireIT(actor);
  const [row] = await db.delete(assetPhoto).where(eq(assetPhoto.id, photoId)).returning();
  return row ?? null;
}

export async function getAssetPhoto(photoId: number, viewer: Actor) {
  if (!isITRole(viewer.role)) return null;
  return (await db.query.assetPhoto.findFirst({ where: eq(assetPhoto.id, photoId) })) ?? null;
}

/* ---------- reading ---------- */

const holder = alias(user, "holder");

const assetColumns = {
  id: asset.id,
  tag: asset.tag,
  name: asset.name,
  make: asset.make,
  model: asset.model,
  serial: asset.serial,
  status: asset.status,
  location: asset.location,
  ipAddress: asset.ipAddress,
  macAddress: asset.macAddress,
  warrantyUntil: asset.warrantyUntil,
  typeId: asset.typeId,
  typeName: assetType.name,
  isPrinter: assetType.isPrinter,
  siteId: asset.siteId,
  siteName: site.name,
  assignedTo: sql<string>`coalesce(${holder.name}, nullif(${asset.assignedTo}, ''))`,
  photoId: sql<number | null>`(select min(${assetPhoto.id}) from ${assetPhoto} where ${assetPhoto.assetId} = ${asset.id})`,
  openTickets: sql<number>`(select count(*)::int from ${ticket} where ${ticket.assetId} = ${asset.id} and ${ticket.status} in ('new','progress','waiting'))`,
};

export type AssetListItem = Awaited<ReturnType<typeof listAssets>>[number];

export async function listAssets(opts: { q?: string; typeId?: number | null; siteId?: number | null; status?: string | null; printersOnly?: boolean; includeRetired?: boolean } = {}) {
  const where: SQL[] = [];
  if (opts.typeId) where.push(eq(asset.typeId, opts.typeId));
  if (opts.siteId) where.push(eq(asset.siteId, opts.siteId));
  if (opts.status && isAssetStatus(opts.status)) where.push(eq(asset.status, opts.status));
  else if (!opts.includeRetired) where.push(ne(asset.status, "retired"));
  if (opts.printersOnly) where.push(eq(assetType.isPrinter, true));
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    where.push(
      or(
        ilike(asset.tag, q),
        eq(asset.tag, normaliseTag(opts.q)),
        ilike(asset.name, q),
        ilike(asset.make, q),
        ilike(asset.model, q),
        ilike(asset.serial, q),
        ilike(asset.ipAddress, q),
        ilike(asset.macAddress, q),
        ilike(asset.location, q),
        ilike(asset.assignedTo, q),
        ilike(holder.name, q),
      )!,
    );
  }
  return db
    .select(assetColumns)
    .from(asset)
    .leftJoin(assetType, eq(assetType.id, asset.typeId))
    .leftJoin(site, eq(site.id, asset.siteId))
    .leftJoin(holder, eq(holder.id, asset.assignedUserId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(assetType.position), asc(asset.name), asc(asset.tag))
    .limit(1000);
}

export async function getAsset(id: number) {
  const [row] = await db
    .select({ ...assetColumns, a: asset })
    .from(asset)
    .leftJoin(assetType, eq(assetType.id, asset.typeId))
    .leftJoin(site, eq(site.id, asset.siteId))
    .leftJoin(holder, eq(holder.id, asset.assignedUserId))
    .where(eq(asset.id, id));
  if (!row) return null;
  const [photos, events, tickets] = await Promise.all([
    db.select({ id: assetPhoto.id, filename: assetPhoto.filename }).from(assetPhoto).where(eq(assetPhoto.assetId, id)).orderBy(asc(assetPhoto.id)),
    db
      .select({ id: assetEvent.id, type: assetEvent.type, data: assetEvent.data, createdAt: assetEvent.createdAt, actorName: user.name })
      .from(assetEvent)
      .leftJoin(user, eq(user.id, assetEvent.actorId))
      .where(eq(assetEvent.assetId, id))
      .orderBy(desc(assetEvent.createdAt), desc(assetEvent.id)),
    db
      .select({ id: ticket.id, title: ticket.title, status: ticket.status, priority: ticket.priority, createdAt: ticket.createdAt })
      .from(ticket)
      .where(eq(ticket.assetId, id))
      .orderBy(desc(ticket.createdAt))
      .limit(50),
  ]);
  return { ...row, photos, events, tickets };
}

export type AssetDetail = NonNullable<Awaited<ReturnType<typeof getAsset>>>;

export async function findAssetByTag(tag: string) {
  return (await db.query.asset.findFirst({ where: eq(asset.tag, normaliseTag(tag)) })) ?? null;
}

export async function assetTypes(includeArchived = false) {
  return db
    .select()
    .from(assetType)
    .where(includeArchived ? undefined : eq(assetType.archived, false))
    .orderBy(asc(assetType.position), asc(assetType.name));
}

/** For linking tickets: short list of matching kit. */
export async function assetOptions() {
  return db
    .select({ id: asset.id, tag: asset.tag, name: asset.name })
    .from(asset)
    .where(ne(asset.status, "retired"))
    .orderBy(asc(asset.tag));
}

export async function openTicketCounts(assetIds: number[]) {
  if (!assetIds.length) return new Map<number, number>();
  const rows = await db
    .select({ assetId: ticket.assetId, n: sql<number>`count(*)::int` })
    .from(ticket)
    .where(and(inArray(ticket.assetId, assetIds), inArray(ticket.status, OPEN_STATUSES)))
    .groupBy(ticket.assetId);
  return new Map(rows.map((r) => [r.assetId!, r.n]));
}

/** Everyone with an account, for "check out to". */
export async function peopleOptions() {
  return db.select({ id: user.id, name: user.name, email: user.email }).from(user).orderBy(asc(user.name));
}
