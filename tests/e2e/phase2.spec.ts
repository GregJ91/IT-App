import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { joinIT } from "./helpers";

// Inventory, stock, printers, labels, import and licences, end to end.
test.describe.configure({ mode: "serial" });

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/p2-${name}.png`, fullPage: true });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAGElEQVR4nGNgYGD4z8DAwMDAxMDAwMAAAA8AAf8dMtkAAAAASUVORK5CYII=", "base64");

let it: BrowserContext;
let laptopUrl = "";
let laptopTag = "";
let printerTag = "";

test("IT adds a laptop with a photo, and it gets a tag and QR label", async ({ browser }) => {
  ({ ctx: it } = await joinIT(browser, "sam.m@gardenersdream.co.uk", "Sam M"));
  const page = await it.newPage();
  await page.goto("/it/assets");
  await expect(page.getByText("Nothing in the inventory yet.")).toBeVisible();
  await page.getByRole("link", { name: "Add item" }).first().click();
  await page.getByLabel("Name").fill("Dell Latitude 5440");
  await page.getByLabel("Type").selectOption({ label: "Laptop" });
  await page.getByLabel("Make").fill("Dell");
  await page.getByLabel("Model").fill("Latitude 5440");
  await page.getByLabel("Serial number").fill("J7H2XK3");
  await page.getByLabel("Site").selectOption({ label: "Head Office" });
  await page.getByLabel("Location").fill("IT cupboard");
  await page.getByLabel("Cost (£)").fill("849.00");
  await page.getByLabel("Warranty until").fill("2027-03-14");
  await page.locator("#files").setInputFiles({ name: "laptop.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Add to inventory" }).click();

  await expect(page.getByText(/^Added as GD-\d{5}\./)).toBeVisible();
  laptopUrl = new URL(page.url()).pathname;
  laptopTag = (await page.locator(".page-head .mono").first().innerText()).trim();
  expect(laptopTag).toMatch(/^GD-\d{5}$/);
  await expect(page.locator(".photo img")).toHaveCount(1);
  await expect(page.getByRole("img", { name: `QR code for ${laptopTag}` })).toBeVisible();
  await expect(page.getByText("£849.00")).toBeVisible();
});

test("checking it out and back in is recorded", async () => {
  const page = await it.newPage();
  await page.goto(laptopUrl);
  await page.getByRole("button", { name: "Check out to someone" }).click();
  await page.getByLabel("Or a place or team").fill("Accounts");
  await page.getByLabel("Note").fill("with charger");
  await page.getByRole("button", { name: "Check out", exact: true }).click();
  await expect(page.locator(".chip", { hasText: "With Accounts" })).toBeVisible();
  await page.getByLabel("Back to location").fill("IT cupboard");
  await page.getByLabel("Check-in note").fill("wiped");
  await page.getByRole("button", { name: "Check back in" }).click();
  await expect(page.getByText("Sam M checked it in from Accounts to IT cupboard: “wiped”")).toBeVisible();
  await expect(page.getByText("Sam M checked it out to Accounts: “with charger”")).toBeVisible();
  await shot(page, "01-laptop");
});

test("a printer shows on the Printers page with its IP and matching toner", async () => {
  const page = await it.newPage();
  await page.goto("/it/assets/new");
  await page.getByLabel("Name").fill("Dispatch laser");
  await page.getByLabel("Type").selectOption({ label: "Printer" });
  await page.getByLabel("Make").fill("HP");
  await page.getByLabel("Model").fill("LaserJet M507");
  await page.getByLabel("Site").selectOption({ label: "Warehouse" });
  await page.getByLabel("Location").fill("Dispatch");
  await page.getByLabel("IP address").fill("10.20.1.31");
  await page.getByLabel("MAC address").fill("3c-52-82-1a-7f-04");
  await page.getByRole("button", { name: "Add to inventory" }).click();
  await expect(page.getByText(/^Added as/)).toBeVisible();
  printerTag = (await page.locator(".page-head .mono").first().innerText()).trim();

  await page.goto("/it/stock/new");
  await page.getByLabel("Name").fill("HP 59A toner");
  await page.getByLabel("Category").fill("Toner");
  await page.getByLabel("How many now").fill("3");
  await page.getByLabel("Alert when fewer than").fill("3");
  await page.getByLabel("Fits").fill("HP LaserJet M507");
  await page.getByRole("button", { name: "Add to stock" }).click();
  await expect(page.getByRole("heading", { name: "HP 59A toner" })).toBeVisible();

  await page.goto("/it/printers");
  const row = page.locator("tr", { hasText: "Dispatch laser" });
  await expect(row.getByRole("link", { name: "10.20.1.31" })).toHaveAttribute("href", "http://10.20.1.31");
  await expect(row.getByText("3C:52:82:1A:7F:04")).toBeVisible();
  await expect(row.getByText("HP 59A toner")).toBeVisible();
  await shot(page, "02-printers");
});

test("taking toner from the stock list drops it below the minimum and alerts IT", async ({ request }) => {
  await request.delete("http://localhost:3199/_calls");
  const page = await it.newPage();
  await page.goto("/it/stock");
  await page.getByRole("button", { name: "Take one HP 59A toner" }).click();
  await expect(page.locator(".stock-row", { hasText: "HP 59A toner" }).locator(".qty")).toHaveText("2");
  await expect(page.locator(".stock-row", { hasText: "HP 59A toner" }).getByText("Low, min 3")).toBeVisible();
  await shot(page, "03-stock");
  const calls = (await (await request.get("http://localhost:3199/_calls")).json()) as { method: string; body: { text?: string } }[];
  expect(calls.map((c) => c.body.text)).toContain("Low stock: HP 59A toner, 2 left (minimum 3)");
});

test("labels print with a QR code each", async () => {
  const page = await it.newPage();
  await page.goto("/it/assets");
  await page.getByRole("link", { name: "Print labels" }).click();
  await expect(page.locator(".qr-label")).toHaveCount(2);
  await expect(page.locator(".qr-label svg")).toHaveCount(2);
  await expect(page.locator(".qr-label", { hasText: laptopTag })).toContainText("Dell Latitude 5440");
  await page.getByRole("link", { name: /Brother/ }).click();
  await expect(page.locator(".qr-label")).toHaveCount(2);
  await shot(page, "04-labels");
});

test("scanning a label: IT opens the item, staff get a pre-filled job", async ({ browser }) => {
  const page = await it.newPage();
  await page.goto(`/a/${laptopTag}`);
  await expect(page).toHaveURL(laptopUrl);

  const staff = await browser.newContext(PHONE);
  const p = await staff.newPage();
  await p.goto(`/a/${printerTag}`);
  await expect(p).toHaveURL(/\/sign-in\?next=/);
  await p.getByRole("link", { name: "Create an account" }).click();
  await p.getByLabel("Your name").fill("Dave K");
  await p.getByLabel("Work email").fill("dave.k@gardenersdream.co.uk");
  await p.getByLabel("Password", { exact: true }).fill("staple-lamp-orchid");
  await p.getByLabel("Type it again").fill("staple-lamp-orchid");
  await p.getByRole("button", { name: "Create account" }).click();
  await expect(p.getByRole("heading", { name: "Hi Dave" })).toBeVisible();
  await p.goto(`/a/${printerTag}`);
  await expect(p).toHaveURL(new RegExp(`/my/new\\?about=${printerTag}`));
  await expect(p.getByText(`About ${printerTag} Dispatch laser (Dispatch)`)).toBeVisible();
  await expect(p.getByLabel("Site")).toHaveValue(/\d+/);
  await expect(p.getByLabel("Where exactly?")).toHaveValue("Dispatch");
  await expect(p.getByLabel("What's it about?")).toHaveValue(/\d+/);
  await p.getByLabel("What's the problem?").fill("Paper jam every few pages");
  await p.getByLabel("Details").fill("Tray 2 jams.");
  await shot(p, "05-report-from-label-phone");
  await p.getByRole("button", { name: "Send to IT" }).click();
  await expect(p.getByText("Sent. IT has been told")).toBeVisible();

  await page.goto("/it/printers");
  await expect(page.locator("tr", { hasText: "Dispatch laser" }).getByText("1 open")).toBeVisible();
  await staff.close();
});

test("the scan page falls back to typing a tag when there's no camera", async () => {
  const page = await it.newPage();
  await page.goto("/it/scan");
  await expect(page.getByText(/camera is blocked|can't use the camera/)).toBeVisible();
  await page.getByLabel("Tag or code").fill(laptopTag.replace("GD-", "gd "));
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(laptopUrl);
});

test("importing a spreadsheet: check first, then import", async () => {
  const page = await it.newPage();
  await page.goto("/it/import");
  const csv = [
    "Tag,Name,Type,Serial,Site,Location,Assigned to,IP,Warranty until",
    ",Raspberry Pi 5 (wall display),Raspberry Pi,b8:27:eb:4c:91:0a,Showroom,Front window,Showroom TV,10.30.1.50,",
    ",Fujitsu fi-8170,Scanner,A21C00418,Warehouse,Goods in,,10.20.1.60,05/05/2027",
    ",Broken row,Laptop,,Atlantis,,,not-an-ip,",
  ].join("\n");
  await page.getByLabel("CSV file").setInputFiles({ name: "kit.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Checked 3 rows: 2 to add, 1 with problems that will be skipped.", { exact: false })).toBeVisible();
  await expect(page.getByText(`"not-an-ip" isn't an IP address like 10.20.1.31.`)).toBeVisible();
  await shot(page, "06-import-check");
  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(page.getByText(/Imported: 2 added\. 1 row was skipped\./)).toBeVisible();
  await page.goto("/it/printers");
  await expect(page.getByText("Fujitsu fi-8170")).toBeVisible();
});

test("licences and low stock show under Coming up on the dashboard", async () => {
  const page = await it.newPage();
  await page.goto("/it/licences");
  const soon = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  await page.getByLabel("Licence name").fill("Microsoft 365 Business Standard");
  await page.getByLabel("Supplier").fill("Microsoft");
  await page.getByLabel("Renews on").fill(soon);
  await page.getByLabel("Seats").fill("48");
  await page.getByRole("button", { name: "Add licence" }).click();
  await expect(page.locator(".setting", { hasText: "Microsoft 365 Business Standard" })).toContainText("48 seats");
  await page.goto("/it");
  const panel = page.locator("section", { hasText: "Coming up" });
  await expect(panel.getByText("Licence · Microsoft 365 Business Standard")).toBeVisible();
  await expect(panel.getByText("Low stock · HP 59A toner")).toBeVisible();
  await shot(page, "07-dashboard");
});

test("on a phone, the menu reaches every page", async ({ browser }) => {
  const phone = await browser.newContext({ ...PHONE, storageState: await it.storageState() });
  const page = await phone.newPage();
  await page.goto("/it/stock");
  await expect(page.locator(".tabbar a")).toHaveCount(5);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.locator(".phone-menu").getByRole("link", { name: "Printers" }).click();
  await expect(page).toHaveURL(/\/it\/printers$/);
  await shot(page, "08-printers-phone");
  await phone.close();
});
