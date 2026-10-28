// Importing existing kit and stock from a spreadsheet saved as CSV.
// Columns are matched by name, so their order doesn't matter and extra columns are ignored.
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { AssetError, checkNetwork, createAsset, findAssetByTag, isAssetStatus, normaliseTag, updateAsset, type AssetInput, type AssetStatus } from "./assets";
import type { Actor } from "./roles";
import { createStockItem } from "./stock";

/** RFC 4180-ish CSV: quoted fields, doubled quotes, commas and line breaks inside quotes, BOM. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const key = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

// Accepted column names (after lowercasing and removing spaces/punctuation).
const ASSET_COLUMNS: Record<string, string[]> = {
  tag: ["tag", "assettag", "assetno", "assetnumber", "id"],
  name: ["name", "description", "item", "device"],
  type: ["type", "category", "devicetype", "kind"],
  make: ["make", "manufacturer", "brand"],
  model: ["model"],
  serial: ["serial", "serialnumber", "serialno", "sn"],
  status: ["status", "state"],
  site: ["site", "branch", "office"],
  location: ["location", "room", "where"],
  assignedTo: ["assignedto", "user", "owner", "person", "issuedto"],
  ip: ["ip", "ipaddress"],
  mac: ["mac", "macaddress"],
  purchaseDate: ["purchasedate", "purchased", "boughton", "dateofpurchase"],
  cost: ["cost", "price", "purchasecost", "value"],
  supplier: ["supplier", "vendor", "boughtfrom"],
  warranty: ["warranty", "warrantyuntil", "warrantyends", "warrantyexpiry", "warrantyend"],
  notes: ["notes", "comments", "comment"],
};

const STOCK_COLUMNS: Record<string, string[]> = {
  name: ["name", "item", "description", "product"],
  category: ["category", "type", "group"],
  quantity: ["quantity", "qty", "count", "instock", "stock", "onhand"],
  min: ["min", "minimum", "minquantity", "reorderlevel", "reorderat", "minstock"],
  site: ["site", "branch", "office"],
  location: ["location", "cupboard", "shelf", "where"],
  supplier: ["supplier", "vendor"],
  fits: ["fits", "compatiblewith", "for", "printer"],
  notes: ["notes", "comments"],
};

function mapHeader(header: string[], columns: Record<string, string[]>) {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const k = key(h);
    for (const [field, names] of Object.entries(columns)) if (idx[field] === undefined && names.includes(k)) idx[field] = i;
  });
  return idx;
}

/** 31/12/2026, 31-12-2026, 2026-12-31 → 2026-12-31. UK order for slashes. */
export function parseDate(v: string): string | null | "bad" {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
    [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += 2000;
  } else return "bad";
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return "bad";
  return date.toISOString().slice(0, 10);
}

/** "£1,249.99" → 124999 pence. */
export function parseMoney(v: string): number | null | "bad" {
  const s = v.replace(/[£,\s]/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return "bad";
  return Math.round(parseFloat(s) * 100);
}

const STATUS_WORDS: Record<string, AssetStatus> = {
  inuse: "in_use",
  issued: "in_use",
  assigned: "in_use",
  active: "in_use",
  spare: "spare",
  instock: "spare",
  available: "spare",
  repair: "repair",
  inrepair: "repair",
  broken: "repair",
  faulty: "repair",
  retired: "retired",
  disposed: "retired",
  scrapped: "retired",
};

export type ImportResult = {
  kind: "assets" | "stock";
  columns: string[];
  missing: string[];
  rows: { line: number; ok: boolean; action: "create" | "update" | "skip"; label: string; problems: string[] }[];
  created: number;
  updated: number;
};

async function lookups() {
  const [types, sites, people] = await Promise.all([
    db.select().from(schema.assetType),
    db.select().from(schema.site),
    db.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email }).from(schema.user),
  ]);
  return { types, sites, people };
}

/**
 * Checks (and with commit = true, saves) a CSV of kit. Rows whose tag already exists are updated;
 * rows without a tag get the next free one. Unknown types are added; unknown sites are reported.
 */
export async function importAssets(actor: Actor, text: string, commit: boolean): Promise<ImportResult> {
  const [header, ...body] = parseCsv(text);
  const result: ImportResult = { kind: "assets", columns: [], missing: [], rows: [], created: 0, updated: 0 };
  if (!header) return { ...result, missing: ["name"] };
  const idx = mapHeader(header, ASSET_COLUMNS);
  result.columns = Object.keys(idx);
  if (idx.name === undefined) return { ...result, missing: ["name"] };
  const L = await lookups();
  const get = (r: string[], f: string) => (idx[f] === undefined ? "" : (r[idx[f]] ?? "").trim());

  for (const [n, r] of body.entries()) {
    const line = n + 2;
    const problems: string[] = [];
    const name = get(r, "name");
    if (!name) {
      result.rows.push({ line, ok: false, action: "skip", label: "(no name)", problems: ["Name is empty"] });
      continue;
    }
    const typeName = get(r, "type");
    let typeId = typeName ? (L.types.find((t) => t.name.toLowerCase() === typeName.toLowerCase())?.id ?? null) : null;
    const siteName = get(r, "site");
    const siteId = siteName ? (L.sites.find((s) => s.name.toLowerCase() === siteName.toLowerCase())?.id ?? null) : null;
    if (siteName && !siteId) problems.push(`Site "${siteName}" isn't in Settings → Sites`);
    const statusWord = key(get(r, "status"));
    const status: AssetStatus = statusWord ? (STATUS_WORDS[statusWord] ?? (isAssetStatus(statusWord) ? statusWord : "spare")) : "spare";
    if (statusWord && !STATUS_WORDS[statusWord] && !isAssetStatus(statusWord)) problems.push(`Status "${get(r, "status")}" not recognised, using Spare`);
    const purchaseDate = parseDate(get(r, "purchaseDate"));
    const warrantyUntil = parseDate(get(r, "warranty"));
    const cost = parseMoney(get(r, "cost"));
    if (purchaseDate === "bad") problems.push(`Purchase date "${get(r, "purchaseDate")}" not understood (use 31/12/2026)`);
    if (warrantyUntil === "bad") problems.push(`Warranty date "${get(r, "warranty")}" not understood (use 31/12/2026)`);
    if (cost === "bad") problems.push(`Cost "${get(r, "cost")}" not understood (use 849.99)`);
    const blocking = problems.filter((p) => !p.includes("using Spare") && !p.startsWith("Site"));

    const tag = get(r, "tag");
    const existing = tag ? await findAssetByTag(tag) : null;
    const label = `${tag ? `${normaliseTag(tag)} ` : ""}${name}`;
    if (blocking.length) {
      result.rows.push({ line, ok: false, action: "skip", label, problems });
      continue;
    }
    if (commit && typeName && !typeId) {
      const [t] = await db
        .insert(schema.assetType)
        .values({ name: typeName, position: 100, isPrinter: /print|scan/i.test(typeName) })
        .onConflictDoUpdate({ target: schema.assetType.name, set: { archived: false } })
        .returning();
      L.types.push(t);
      typeId = t.id;
    } else if (typeName && !typeId) problems.push(`New type "${typeName}" will be added`);

    const assigned = get(r, "assignedTo");
    const person = assigned ? L.people.find((p) => p.email.toLowerCase() === assigned.toLowerCase() || p.name.toLowerCase() === assigned.toLowerCase()) : null;
    const input: AssetInput = {
      name,
      typeId,
      make: get(r, "make"),
      model: get(r, "model"),
      serial: get(r, "serial"),
      status: assigned && status === "spare" ? "in_use" : status,
      siteId,
      location: get(r, "location"),
      ipAddress: get(r, "ip"),
      macAddress: get(r, "mac"),
      purchaseDate: purchaseDate as string | null,
      purchaseCostPence: cost as number | null,
      supplier: get(r, "supplier"),
      warrantyUntil: warrantyUntil as string | null,
      notes: get(r, "notes"),
    };
    try {
      if (commit) {
        const row = existing ? await updateAsset(actor, existing.id, input) : await createAsset(actor, input, [], tag || undefined);
        if (assigned) {
          await db
            .update(schema.asset)
            .set(person ? { assignedUserId: person.id, assignedTo: "" } : { assignedUserId: null, assignedTo: assigned })
            .where(eq(schema.asset.id, row.id));
        }
        await db.insert(schema.assetEvent).values({ assetId: row.id, actorId: actor.id, type: "imported", data: { line } });
      } else {
        // Dry run: still check the network fields so the preview shows the problem.
        checkNetwork(input);
      }
      if (existing) result.updated++;
      else result.created++;
      result.rows.push({ line, ok: true, action: existing ? "update" : "create", label, problems });
    } catch (e) {
      if (!(e instanceof AssetError)) throw e;
      result.rows.push({ line, ok: false, action: "skip", label, problems: [...problems, e.message] });
    }
  }
  return result;
}

/** Checks (and with commit = true, saves) a CSV of cupboard stock. Always adds new items. */
export async function importStock(actor: Actor, text: string, commit: boolean): Promise<ImportResult> {
  const [header, ...body] = parseCsv(text);
  const result: ImportResult = { kind: "stock", columns: [], missing: [], rows: [], created: 0, updated: 0 };
  if (!header) return { ...result, missing: ["name"] };
  const idx = mapHeader(header, STOCK_COLUMNS);
  result.columns = Object.keys(idx);
  if (idx.name === undefined) return { ...result, missing: ["name"] };
  const L = await lookups();
  const get = (r: string[], f: string) => (idx[f] === undefined ? "" : (r[idx[f]] ?? "").trim());
  const existingNames = new Set(
    (await db.select({ name: schema.stockItem.name }).from(schema.stockItem).where(sql`not ${schema.stockItem.archived}`)).map((x) => x.name.toLowerCase()),
  );

  for (const [n, r] of body.entries()) {
    const line = n + 2;
    const problems: string[] = [];
    const name = get(r, "name");
    if (!name) {
      result.rows.push({ line, ok: false, action: "skip", label: "(no name)", problems: ["Name is empty"] });
      continue;
    }
    const qty = get(r, "quantity") === "" ? 0 : Number(get(r, "quantity"));
    const min = get(r, "min") === "" ? 0 : Number(get(r, "min"));
    if (!Number.isInteger(qty) || qty < 0) problems.push(`Quantity "${get(r, "quantity")}" must be a whole number`);
    if (!Number.isInteger(min) || min < 0) problems.push(`Minimum "${get(r, "min")}" must be a whole number`);
    if (existingNames.has(name.toLowerCase())) problems.push("Already in stock with this name");
    const siteName = get(r, "site");
    const siteId = siteName ? (L.sites.find((s) => s.name.toLowerCase() === siteName.toLowerCase())?.id ?? null) : null;
    if (problems.length) {
      result.rows.push({ line, ok: false, action: "skip", label: name, problems });
      continue;
    }
    if (siteName && !siteId) problems.push(`Site "${siteName}" isn't in Settings → Sites`);
    if (commit) {
      await createStockItem(
        actor,
        { name, category: get(r, "category"), siteId, location: get(r, "location"), minQuantity: min, supplier: get(r, "supplier"), fits: get(r, "fits"), notes: get(r, "notes") },
        qty,
      );
    }
    existingNames.add(name.toLowerCase());
    result.created++;
    result.rows.push({ line, ok: true, action: "create", label: `${name} (${qty})`, problems });
  }
  return result;
}

export const ASSET_TEMPLATE =
  "Tag,Name,Type,Make,Model,Serial,Status,Site,Location,Assigned to,IP,MAC,Purchase date,Cost,Supplier,Warranty until,Notes\n" +
  ",Dell Latitude 5440,Laptop,Dell,Latitude 5440,J7H2XK3,In use,Head Office,Accounts,mark.d@gardenersdream.co.uk,,,14/03/2024,849.00,Dell,14/03/2027,\n" +
  ",HP LaserJet M507,Printer,HP,LaserJet M507,PHBQ71830,In use,Warehouse,Dispatch,Dispatch,10.20.1.31,3C:52:82:1A:7F:04,30/06/2024,412.50,Insight,30/06/2027,\n";

export const STOCK_TEMPLATE =
  "Name,Category,Quantity,Minimum,Site,Location,Supplier,Fits,Notes\n" +
  "HP 59A toner,Toner,3,2,Warehouse,Cupboard B shelf 2,Insight,HP LaserJet M507,\n" +
  "Logitech MK295 keyboard and mouse,Peripherals,4,3,Head Office,IT cupboard,Amazon,,\n";
