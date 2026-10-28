import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import { auth } from "./auth";

import { isITRole, type Role } from "./roles";

export { isITRole, type Role };

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  twoFactorEnabled: boolean;
  sessionId: string;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await getSession();
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: string; phone?: string | null; twoFactorEnabled?: boolean | null };
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: (isITRole(u.role) ? u.role : "staff") as Role,
    phone: u.phone ?? null,
    twoFactorEnabled: !!u.twoFactorEnabled,
    sessionId: s.session.id,
  };
});

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/sign-in");
  return u;
}

export async function sessionVerified(sessionId: string) {
  const row = await db.query.sessionCheck.findFirst({ where: eq(schema.sessionCheck.sessionId, sessionId) });
  return !!row?.verifiedAt;
}

/** IT pages need an IT role, an authenticator set up, and the code entered on this session. */
export async function requireIT() {
  const u = await requireUser();
  if (!isITRole(u.role)) redirect("/my");
  if (!u.twoFactorEnabled) redirect("/setup-2fa");
  if (!(await sessionVerified(u.sessionId))) redirect("/verify");
  return u;
}

export async function requireAdmin() {
  const u = await requireIT();
  if (u.role !== "admin") redirect("/it");
  return u;
}

/** Home for a signed-in user. */
export function homeFor(role: Role) {
  return isITRole(role) ? "/it" : "/my";
}
