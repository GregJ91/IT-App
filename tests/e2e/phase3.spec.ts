import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { startFakeUnifi } from "../fake-unifi";
import { joinIT } from "./helpers";

// Network pages, end to end, against a stand-in UniFi console (no real kit).
// Runs after phase2.spec.ts, so the "Dispatch laser" printer (MAC 3C:52:82:1A:7F:04) is in the inventory.
test.describe.configure({ mode: "serial" });

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/p3-${name}.png`, fullPage: true });

let it: BrowserContext;
let unifi: Awaited<ReturnType<typeof startFakeUnifi>>;

test.beforeAll(async () => {
  unifi = await startFakeUnifi(3198);
});
test.afterAll(async () => {
  await unifi?.close();
});

test("before anything is connected, Network says how to set it up", async ({ browser }) => {
  ({ ctx: it } = await joinIT(browser, "net.admin@gardenersdream.co.uk", "Net Admin"));
  const page = await it.newPage();
  await page.goto("/it/network");
  await expect(page.getByText("Not connected to UniFi yet.")).toBeVisible();
  await page.getByRole("link", { name: "Set up in Settings" }).click();
  await expect(page.getByRole("heading", { name: "Network (UniFi)" })).toBeVisible();
  await expect(page.getByText("Not connected. Nothing is read from your network")).toBeVisible();
});

test("a wrong API key is explained, and the right one connects", async () => {
  const page = await it.newPage();
  await page.goto("/it/settings#network");
  const form = page.locator("form", { has: page.getByRole("heading", { name: "Add a connection" }) });
  await form.getByLabel("Connection name").fill("Warehouse console");
  await form.getByLabel("Console address").fill("http://localhost:3198");
  await form.getByLabel("API key").fill("not-the-key");
  await form.getByRole("button", { name: "Check and connect" }).click();
  await expect(form.getByText(/turned down the API key/)).toBeVisible();
  await expect(page.getByText("Not connected. Nothing is read from your network")).toBeVisible();

  await form.getByLabel("Connection name").fill("Warehouse console");
  await form.getByLabel("Console address").fill("http://localhost:3198");
  await form.getByLabel("API key").fill("unifi-test-key");
  await form.getByRole("button", { name: "Check and connect" }).click();
  const row = page.locator(".setting", { hasText: "Warehouse console" });
  await expect(row.getByText("Working")).toBeVisible();
  await expect(row.getByText("key unif…-key")).toBeVisible();
  await expect(page.getByText("unifi-test-key")).toHaveCount(0);
  // Matched to our Warehouse site by name.
  await expect(page.getByLabel("Our site for Warehouse")).toHaveValue(/\d+/);
  await shot(page, "01-settings");
});

test("the overview, site and device pages show the stand-in kit", async () => {
  const page = await it.newPage();
  await page.goto("/it/network");
  const card = page.locator(".net-card", { hasText: "Warehouse" });
  await expect(card.getByText("3/3")).toBeVisible();
  await shot(page, "02-overview");

  await card.click();
  await expect(page.getByRole("heading", { name: "Warehouse", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Map" })).toBeVisible();
  await shot(page, "03-site");
  await expect(page.locator("tr", { hasText: "NPI1A7F04" })).toContainText("Cable · Dispatch switch");
  await expect(page.locator("tr", { hasText: "Handheld 1" })).toContainText("Wi-Fi · AP Dispatch");

  await page.getByRole("link", { name: "AP Dispatch" }).first().click();
  await expect(page.getByRole("heading", { name: "AP Dispatch", level: 1 })).toBeVisible();
  await expect(page.getByText("U6-Mesh")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connected through it now" })).toBeVisible();
  await shot(page, "04-device");
});

test("searching finds a device across sites, and the printer shows as online", async () => {
  const page = await it.newPage();
  await page.goto("/it/network/clients?q=3C:52:82");
  await expect(page.locator("tr", { hasText: "NPI1A7F04" })).toBeVisible();

  await page.goto("/it/printers");
  const row = page.locator("tr", { hasText: "Dispatch laser" });
  await expect(row.getByText("Online")).toBeVisible();
  await shot(page, "05-printers");
});

test("UniFi kit is added to the inventory", async () => {
  const page = await it.newPage();
  await page.goto("/it/assets?q=Dispatch switch");
  await page.getByRole("link", { name: "Dispatch switch" }).first().click();
  await expect(page.getByText("Added automatically from UniFi").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "On the network" })).toBeVisible();
});

test("when an access point drops off, Refresh now shows it", async () => {
  unifi.state.sites[0].devices.find((d) => d.id === "d-ap")!.state = "OFFLINE";
  const page = await it.newPage();
  await page.goto("/it/network");
  await page.getByRole("button", { name: "Refresh now" }).click();
  const card = page.locator(".net-card", { hasText: "Warehouse" });
  await expect(card.getByText("2/3")).toBeVisible();
  await expect(card.getByText("AP Dispatch")).toBeVisible();
  await shot(page, "05b-ap-down");

  unifi.state.sites[0].devices.find((d) => d.id === "d-ap")!.state = "ONLINE";
  await page.getByRole("button", { name: "Refresh now" }).click();
  await expect(card.getByText("3/3")).toBeVisible();
});

test("the example network adds three sites and the dashboard shows them", async () => {
  const page = await it.newPage();
  await page.goto("/it/settings#network");
  const form = page.locator("form", { has: page.getByRole("heading", { name: "Add a connection" }) });
  await form.getByRole("button", { name: "Example network" }).click();
  await form.getByRole("button", { name: "Add example network" }).click();
  await expect(page.locator(".setting", { hasText: "Example network" }).getByText("Working")).toBeVisible();

  await page.goto("/it");
  const panel = page.locator(".panel", { has: page.getByRole("heading", { name: "Network" }) });
  await expect(panel.getByText("Head Office")).toBeVisible();
  await expect(panel.getByText("Showroom")).toBeVisible();
  await expect(panel.getByText("1 device down")).toBeVisible();
  await shot(page, "06-dashboard");

  const phone = await it.browser()!.newContext({ ...PHONE, storageState: await it.storageState() });
  const p = await phone.newPage();
  await p.goto("/it/network");
  await expect(p.getByRole("heading", { name: "Network", level: 1 })).toBeVisible();
  await shot(p, "07-phone-overview");
  await phone.close();
});
