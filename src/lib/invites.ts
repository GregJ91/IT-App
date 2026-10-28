import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "./config";

const { invite } = schema;

export type InviteRole = "tech" | "admin";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const inviteUrl = (token: string) => `${config.appUrl}/invite/${token}`;

const pendingWhere = (now = new Date()) =>
  and(isNull(invite.acceptedAt), isNull(invite.revokedAt), gt(invite.expiresAt, now));

/** Creates an invite and returns the one-time token. Only the hash is stored. */
export async function createInvite(input: { email: string; name: string; role: InviteRole; invitedById: string | null }) {
  const token = randomBytes(24).toString("base64url");
  const email = input.email.trim().toLowerCase();
  // A new invite replaces any earlier pending one for the same address.
  await db
    .update(invite)
    .set({ revokedAt: new Date() })
    .where(and(eq(invite.email, email), pendingWhere()));
  const [row] = await db
    .insert(invite)
    .values({
      tokenHash: hashToken(token),
      email,
      name: input.name.trim(),
      role: input.role,
      invitedById: input.invitedById,
      expiresAt: new Date(Date.now() + config.inviteDays * 24 * 60 * 60 * 1000),
    })
    .returning();
  return { invite: row, token };
}

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export function inviteStatus(row: typeof invite.$inferSelect, now = new Date()): InviteStatus {
  if (row.acceptedAt) return "accepted";
  if (row.revokedAt) return "revoked";
  if (row.expiresAt <= now) return "expired";
  return "pending";
}

export async function getInviteByToken(token: string) {
  const row = await db.query.invite.findFirst({ where: eq(invite.tokenHash, hashToken(token)) });
  return row ?? null;
}

export async function findPendingInviteByEmail(email: string) {
  const row = await db.query.invite.findFirst({
    where: and(eq(invite.email, email.trim().toLowerCase()), pendingWhere()),
  });
  return row ?? null;
}

/**
 * Gives the signed-in user the invite's role. The account email must match the
 * invited address so a forwarded link can't be used by someone else.
 */
export async function acceptInvite(token: string, account: { id: string; email: string }) {
  const row = await getInviteByToken(token);
  if (!row) return { ok: false as const, reason: "This invite link isn't valid." };
  const status = inviteStatus(row);
  if (status === "accepted" && row.acceptedById === account.id) return { ok: true as const, invite: row };
  if (status !== "pending") return { ok: false as const, reason: `This invite has ${status === "revoked" ? "been cancelled" : status === "expired" ? "expired" : "already been used"}. Ask an IT admin for a new one.` };
  if (row.email !== account.email.toLowerCase()) {
    return { ok: false as const, reason: `This invite is for ${row.email}. You're signed in as ${account.email}.` };
  }
  await db.transaction(async (tx) => {
    await tx.update(invite).set({ acceptedAt: new Date(), acceptedById: account.id }).where(eq(invite.id, row.id));
    await tx.update(schema.user).set({ role: row.role, updatedAt: new Date() }).where(eq(schema.user.id, account.id));
  });
  return { ok: true as const, invite: row };
}

export async function revokeInvite(id: number) {
  await db.update(invite).set({ revokedAt: new Date() }).where(and(eq(invite.id, id), pendingWhere()));
}

/** Issues a fresh link (and expiry) for an existing invite. */
export async function reissueInvite(id: number, invitedById: string) {
  const row = await db.query.invite.findFirst({ where: eq(invite.id, id) });
  if (!row || row.acceptedAt) return null;
  return createInvite({ email: row.email, name: row.name, role: row.role as InviteRole, invitedById });
}

export async function listInvites() {
  return db.query.invite.findMany({ orderBy: desc(invite.createdAt), limit: 50 });
}
