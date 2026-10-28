import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth-helpers";
import { emailDomainAllowed } from "@/lib/config";

describe("safeNext", () => {
  it("allows paths inside the app", () => {
    expect(safeNext("/it/tickets/1001")).toBe("/it/tickets/1001");
  });
  it("blocks other sites", () => {
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("/\\evil.example")).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});

describe("emailDomainAllowed", () => {
  it("matches configured domains, case-insensitively", () => {
    expect(emailDomainAllowed("Kirsty@GardenersDream.co.uk")).toBe(true);
    expect(emailDomainAllowed("someone@gmail.com")).toBe(false);
  });
});
