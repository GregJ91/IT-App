import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { acceptInvite, createInvite, findPendingInviteByEmail, getInviteByToken, inviteStatus, reissueInvite, revokeInvite } from "@/lib/invites";
import { makeUser, resetData } from "./db-helpers";

beforeEach(async () => {
  await resetData();
});

describe("invites", () => {
  it("stores only a hash of the token", async () => {
    const { token, invite } = await createInvite({ email: "Jamie.F@gardenersdream.co.uk", name: "Jamie F", role: "tech", invitedById: null });
    expect(invite.tokenHash).not.toContain(token);
    expect(invite.email).toBe("jamie.f@gardenersdream.co.uk");
    expect((await getInviteByToken(token))?.id).toBe(invite.id);
  });

  it("gives the invited role to the matching account, once", async () => {
    const { token } = await createInvite({ email: "jamie.f@gardenersdream.co.uk", name: "Jamie F", role: "tech", invitedById: null });
    const jamie = await makeUser("Jamie F", "staff");
    const res = await acceptInvite(token, jamie);
    expect(res.ok).toBe(true);
    const u = await db.query.user.findFirst({ where: eq(schema.user.id, jamie.id) });
    expect(u?.role).toBe("tech");

    const other = await makeUser("Someone Else", "staff");
    const again = await acceptInvite(token, other);
    expect(again.ok).toBe(false);
  });

  it("refuses a different email address", async () => {
    const { token } = await createInvite({ email: "jamie.f@gardenersdream.co.uk", name: "Jamie F", role: "admin", invitedById: null });
    const mark = await makeUser("Mark D", "staff");
    const res = await acceptInvite(token, mark);
    expect(res.ok).toBe(false);
    const u = await db.query.user.findFirst({ where: eq(schema.user.id, mark.id) });
    expect(u?.role).toBe("staff");
  });

  it("expires, can be cancelled, and a new link replaces the old one", async () => {
    const first = await createInvite({ email: "a@contractor.com", name: "A", role: "tech", invitedById: null });
    expect(await findPendingInviteByEmail("A@contractor.com")).not.toBeNull();

    const second = await reissueInvite(first.invite.id, (await makeUser("Greg J", "admin")).id);
    expect(inviteStatus((await getInviteByToken(first.token))!)).toBe("revoked");
    expect(inviteStatus((await getInviteByToken(second!.token))!)).toBe("pending");

    await revokeInvite(second!.invite.id);
    expect(await findPendingInviteByEmail("a@contractor.com")).toBeNull();

    const old = await createInvite({ email: "b@contractor.com", name: "B", role: "tech", invitedById: null });
    await db.update(schema.invite).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.invite.id, old.invite.id));
    expect(inviteStatus((await getInviteByToken(old.token))!)).toBe("expired");
  });
});
