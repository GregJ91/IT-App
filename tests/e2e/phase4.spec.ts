import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { joinIT } from "./helpers";

// Starters and leavers, and help articles, end to end.
test.describe.configure({ mode: "serial" });

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/p4-${name}.png`, fullPage: true });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAGElEQVR4nGNgYGD4z8DAwMDAxMDAwMAAAA8AAf8dMtkAAAAASUVORK5CYII=", "base64");
const LEE = { name: "Lee T", email: "lee.t@gardenersdream.co.uk", password: "otter-candle-meadow" };

let it: BrowserContext;
let staff: BrowserContext;

async function addKit(page: Page, name: string) {
  await page.goto("/it/assets/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Type").selectOption({ label: "Laptop" });
  await page.getByLabel("Site").selectOption({ label: "Head Office" });
  await page.getByLabel("Location").fill("IT cupboard");
  await page.getByRole("button", { name: "Add to inventory" }).click();
  await expect(page.getByText(/^Added as/)).toBeVisible();
  return { url: new URL(page.url()).pathname, tag: (await page.locator(".page-head .mono").first().innerText()).trim() };
}

test("IT writes a help article with a screenshot and publishes it", async ({ browser }) => {
  ({ ctx: it } = await joinIT(browser, "ali.r@gardenersdream.co.uk", "Ali R"));
  const page = await it.newPage();
  await page.goto("/it/help");
  await expect(page.getByText("No help articles yet.")).toBeVisible();
  await page.getByRole("link", { name: "New article" }).click();
  await page.getByLabel("Title").fill("Label printer printing blank labels");
  await page.getByLabel("One-line summary").fill("Reload the roll and recalibrate the Zebra");
  await page.getByLabel("Category").selectOption({ label: "Printer" });
  await page.getByLabel("Article").fill("The labels have come off the sensor.\n\n## Fix it\n\n1. Open the lid and reseat the roll\n2. Hold **feed** until it flashes twice\n\n> Still blank? Raise a job.\n");
  await page.locator('input[type="file"]').setInputFiles({ name: "zebra-feed-button.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByLabel("Article")).toHaveValue(/!\[zebra-feed-button\]\(\/api\/help-images\/\d+\)/);
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator(".prose ol li")).toHaveCount(2);
  await expect(page.locator(".prose img")).toHaveAttribute("alt", "zebra-feed-button");
  await page.getByRole("button", { name: "Write" }).click();
  await page.getByRole("checkbox", { name: /^Published/ }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("link", { name: "View as staff" })).toBeVisible();

  // A draft too, which staff mustn't see.
  await page.goto("/it/help/new");
  await page.getByLabel("Title").fill("Printer driver install (draft)");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.goto("/it/help");
  await expect(page.locator("tr", { hasText: "Label printer printing blank labels" }).getByText("Published")).toBeVisible();
  await expect(page.locator("tr", { hasText: "Printer driver install" }).getByText("Draft", { exact: true })).toBeVisible();
  await shot(page, "01-help-admin");
});

test("staff find the article in Help and say it helped", async ({ browser }) => {
  staff = await browser.newContext(PHONE);
  const page = await staff.newPage();
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(LEE.name);
  await page.getByLabel("Work email").fill(LEE.email);
  await page.getByLabel("Password", { exact: true }).fill(LEE.password);
  await page.getByLabel("Type it again").fill(LEE.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Hi Lee" })).toBeVisible();

  await page.getByRole("link", { name: "Help" }).first().click();
  await expect(page.getByText("Printer driver install")).toHaveCount(0);
  await page.getByPlaceholder("What do you need help with?").fill("zebra blank");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: /Label printer printing blank labels/ }).click();
  await expect(page.getByRole("heading", { name: "Label printer printing blank labels" })).toBeVisible();
  const img = page.locator(".prose img");
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(8);
  await shot(page, "02-article-phone");
  await page.getByRole("button", { name: "Yes" }).click();
  await expect(page.getByText("Great, glad it helped.")).toBeVisible();

  // Drafts aren't reachable by address either.
  const res = await page.goto("/my/help/printer-driver-install-draft");
  expect(res?.status()).toBe(404);
});

test("typing a new job suggests the article, and 'This fixed it' means nothing is sent", async () => {
  const page = await staff.newPage();
  await page.goto("/my/new");
  await page.getByLabel("What's the problem?").fill("Dispatch label printer gives blank labels");
  const box = page.locator(".suggest");
  await expect(box.getByText("These might fix it straight away")).toBeVisible();
  await box.getByText("Label printer printing blank labels").click();
  await expect(box.getByText("Hold feed until it flashes twice")).toBeVisible();
  await shot(page, "03-suggestion-phone");
  await box.getByRole("button", { name: "This fixed it" }).click();
  await expect(page.getByText("Nothing has been sent to IT.")).toBeVisible();
  await page.goto("/my");
  await expect(page.getByText("You haven't raised any IT jobs yet.")).toBeVisible();

  const itPage = await it.newPage();
  await itPage.goto("/it/help");
  const row = itPage.locator("tr", { hasText: "Label printer printing blank labels" });
  await expect(row.locator("td").nth(3)).toHaveText("100% of 1");
  await expect(row.locator("td").nth(4)).toHaveText("1");
});

test("a new starter gets the standard checklist, and handing out their laptop checks it out", async () => {
  const page = await it.newPage();
  const laptop = await addKit(page, "ThinkPad E14 (starter)");
  await page.goto("/it/people");
  await expect(page.getByText("No one starting or leaving.")).toBeVisible();
  await page.getByRole("link", { name: "New starter" }).click();
  await page.getByLabel("Name").fill("Jamie Fox");
  await page.getByLabel("Work email").fill("jamie.fox@gardenersdream.co.uk");
  const start = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  await page.getByLabel("First day").fill(start);
  await page.getByLabel("Site").selectOption({ label: "Warehouse" });
  await page.getByLabel("Job title").fill("Dispatch lead");
  await page.getByLabel("Manager").fill("Dave K");
  await page.getByLabel(new RegExp(laptop.tag)).check();
  await page.getByRole("button", { name: "Add starter" }).click();

  await expect(page.getByRole("heading", { name: "Jamie Fox" })).toBeVisible();
  await expect(page.locator(".chip", { hasText: "Starts in 3 days" })).toBeVisible();
  await expect(page.getByText("Create their email account")).toBeVisible();
  await page.getByLabel("New task").fill("Order a headset");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Order a headset")).toBeVisible();

  await page.getByRole("button", { name: `Tick: Hand out ${laptop.tag} ThinkPad E14 (starter)` }).click();
  await expect(page.getByRole("button", { name: `Untick: Hand out ${laptop.tag} ThinkPad E14 (starter)` })).toBeVisible();
  await shot(page, "04-starter");

  await page.goto(laptop.url);
  await expect(page.locator(".chip", { hasText: "With Jamie Fox" })).toBeVisible();

  await page.goto("/it");
  const soon = page.locator(".panel", { has: page.getByRole("heading", { name: "Coming up" }) });
  await expect(soon.getByRole("link", { name: /Starter · Jamie Fox/ })).toBeVisible();
  await expect(soon.getByText("3 days")).toBeVisible();

  // Ticking the rest finishes it.
  await page.goto("/it/people");
  await page.getByRole("link", { name: /Jamie Fox/ }).click();
  await expect(page.getByRole("button", { name: "Untick: Order a headset" }).or(page.getByRole("button", { name: "Tick: Order a headset" }))).toBeVisible();
  for (;;) {
    const next = page.getByRole("button", { name: /^Tick: / }).first();
    if (!(await next.count())) break;
    const label = (await next.getAttribute("aria-label"))!;
    await next.click();
    await expect(page.getByRole("button", { name: label.replace(/^Tick/, "Untick") })).toBeVisible();
  }
  await expect(page.locator(".chip", { hasText: "All done" })).toBeVisible();
  await page.goto("/it/people?view=done");
  await expect(page.getByRole("link", { name: /Jamie Fox/ })).toBeVisible();
});

test("a leaver's kit is found from their account and collecting it checks it back in", async () => {
  const page = await it.newPage();
  const laptop = await addKit(page, "Latitude 3440 (leaver)");
  await page.getByRole("button", { name: "Check out to someone" }).click();
  await page.getByLabel("Person").selectOption({ label: LEE.name });
  await page.getByRole("button", { name: "Check out", exact: true }).click();
  await expect(page.locator(".chip", { hasText: `With ${LEE.name}` })).toBeVisible();

  await page.goto("/it/people/new?kind=leaver");
  await page.getByLabel("Who's leaving?").selectOption({ label: `${LEE.name} (${LEE.email})` });
  await expect(page.getByLabel("Name")).toHaveValue(LEE.name);
  await page.getByLabel("Last day").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Add leaver" }).click();
  await expect(page.getByRole("heading", { name: LEE.name })).toBeVisible();
  await expect(page.getByText("Disable their email account at the end of their last day")).toBeVisible();
  const collect = page.getByRole("button", { name: `Tick: Collect ${laptop.tag} Latitude 3440 (leaver)` });
  await expect(collect).toBeVisible();
  await collect.click();
  await expect(page.getByRole("button", { name: `Untick: Collect ${laptop.tag} Latitude 3440 (leaver)` })).toBeVisible();
  await shot(page, "05-leaver");

  await page.goto(laptop.url);
  await expect(page.locator(".chip", { hasText: "Spare" }).first()).toBeVisible();
});

test("admins can change the standard checklists", async () => {
  const page = await it.newPage();
  await page.goto("/it/settings#checklists");
  const leaver = page.locator(".panel", { has: page.getByRole("heading", { name: "Leaver checklist" }) });
  await leaver.getByLabel("New leaver task").fill("Collect their door fob");
  await leaver.getByRole("button", { name: "Add" }).click();
  await expect(leaver.getByText("Collect their door fob")).toBeVisible();
  await leaver.getByRole("button", { name: "Remove: Collect their door fob" }).click();
  await expect(leaver.getByText("Collect their door fob")).toHaveCount(0);
});

test("on a phone, the starters list and a checklist fit the screen", async () => {
  const phone = await it.browser()!.newContext({ ...PHONE, storageState: await it.storageState() });
  const page = await phone.newPage();
  await page.goto("/it/people?view=done");
  await expect(page.getByRole("link", { name: /Jamie Fox/ })).toBeVisible();
  await page.getByRole("link", { name: /Jamie Fox/ }).click();
  await expect(page.getByRole("heading", { name: "Jamie Fox" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, "06-starter-phone");
  await phone.close();
});
