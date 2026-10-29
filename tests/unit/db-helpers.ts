import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Actor, Role } from "@/lib/roles";

export async function resetData() {
  await db.execute(sql`truncate table ticket_event, time_entry, attachment, ticket_message, net_event, net_client, net_device, net_site, net_connection, stock_movement, stock_item, licence, asset_event, asset_photo, asset, asset_type, ticket, assignment_rule, invite, app_setting, session_check, session, account, two_factor, "user", site, category, sla_policy restart identity cascade`);
  await db.insert(schema.slaPolicy).values([
    { priority: 1, label: "Critical", responseMinutes: 15, resolveMinutes: 240 },
    { priority: 2, label: "High", responseMinutes: 60, resolveMinutes: 1440 },
    { priority: 3, label: "Normal", responseMinutes: 240, resolveMinutes: 4320 },
    { priority: 4, label: "Low", responseMinutes: 1440, resolveMinutes: 7200 },
  ]);
  const sites = await db.insert(schema.site).values([{ name: "Head Office" }, { name: "Warehouse" }]).returning();
  const cats = await db.insert(schema.category).values([{ name: "Printer" }, { name: "Network" }]).returning();
  const types = await db
    .insert(schema.assetType)
    .values([{ name: "Laptop" }, { name: "Printer", isPrinter: true }])
    .returning();
  return { sites, cats, types };
}

export async function makeUser(name: string, role: Role): Promise<Actor> {
  const id = randomUUID();
  const email = `${name.toLowerCase().replace(/\s+/g, ".")}@gardenersdream.co.uk`;
  await db.insert(schema.user).values({ id, name, email, role });
  return { id, name, email, role, phone: null };
}

export const png = (name = "shot.png") =>
  new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], name, { type: "image/png" });
