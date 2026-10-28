import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Only allow redirects within the app. */
export function safeNext(next: FormDataEntryValue | string | null | undefined) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : null;
}

export async function hasPassword(userId: string) {
  const row = await db.query.account.findFirst({
    where: and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")),
  });
  return !!row;
}
