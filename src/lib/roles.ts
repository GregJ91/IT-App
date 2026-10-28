export type Role = "staff" | "tech" | "admin";

export const isITRole = (role: string | null | undefined): role is "tech" | "admin" => role === "tech" || role === "admin";

/** The bits of a signed-in user that permission checks need. */
export type Actor = { id: string; name: string; email: string; role: Role; phone: string | null };
