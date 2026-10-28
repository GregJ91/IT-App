import { describe, expect, it } from "vitest";
import { pickAssignee, type Rule } from "@/lib/assignment";

const rule = (id: number, position: number, categoryId: number | null, siteId: number | null, assigneeId: string | null): Rule => ({ id, position, categoryId, siteId, assigneeId });

describe("pickAssignee", () => {
  const rules = [
    rule(1, 30, null, null, null), // anything else: unassigned
    rule(2, 10, 4, 2, "greg"), // printer at warehouse
    rule(3, 20, 3, null, "ali"), // network anywhere
  ];
  it("uses the first matching rule by position", () => {
    expect(pickAssignee(rules, { categoryId: 4, siteId: 2 })).toBe("greg");
    expect(pickAssignee(rules, { categoryId: 3, siteId: 1 })).toBe("ali");
  });
  it("falls through to the catch-all", () => {
    expect(pickAssignee(rules, { categoryId: 4, siteId: 1 })).toBeNull();
    expect(pickAssignee(rules, { categoryId: null, siteId: null })).toBeNull();
  });
  it("returns null with no rules", () => {
    expect(pickAssignee([], { categoryId: 1, siteId: 1 })).toBeNull();
  });
});
