import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Actor } from "./roles";
import { isITRole } from "./roles";

const { licence } = schema;

export class LicenceError extends Error {}

export type LicenceInput = {
  name: string;
  supplier: string;
  seats: number | null;
  renewsOn: string | null;
  costPence: number | null;
  notes: string;
};

const requireIT = (actor: Actor) => {
  if (!isITRole(actor.role)) throw new LicenceError("Only the IT team can change licences.");
};

export async function listLicences() {
  return db.select().from(licence).where(eq(licence.archived, false)).orderBy(asc(licence.renewsOn), asc(licence.name));
}

export async function saveLicence(actor: Actor, id: number | null, input: LicenceInput) {
  requireIT(actor);
  if (!input.name.trim()) throw new LicenceError("Give the licence a name.");
  if (id) {
    const [row] = await db.update(licence).set({ ...input, updatedAt: new Date() }).where(eq(licence.id, id)).returning();
    if (!row) throw new LicenceError("Licence not found.");
    return row;
  }
  const [row] = await db.insert(licence).values(input).returning();
  return row;
}

export async function archiveLicence(actor: Actor, id: number) {
  requireIT(actor);
  await db.update(licence).set({ archived: true, updatedAt: new Date() }).where(and(eq(licence.id, id)));
}
