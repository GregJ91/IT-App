import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { makeInvite, totp } from "./helpers";

// One story from start to finish: an admin joins by invite, a member of staff raises
// a job with a screenshot, IT works it, and the requester sees the right things.
test.describe.configure({ mode: "serial" });

const ADMIN = { email: "greg@gardenersdream.co.uk", name: "Greg J", password: "correct-horse-battery" };
const STAFF = { email: "kirsty@gardenersdream.co.uk", name: "Kirsty P", password: "staple-lamp-orchid" };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

let secret = "";
let adminCtx: BrowserContext;
let staffCtx: BrowserContext;
let ticketPath = "";

// A tiny valid PNG to stand in for a screenshot.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAGElEQVR4nGNgYGD4z8DAwMDAxMDAwMAAAA8AAf8dMtkAAAAASUVORK5CYII=",
  "base64",
);

async function enterCode(page: Page) {
  // Wait for a fresh 30-second window so the code isn't the one used a moment ago.
  const msIntoWindow = Date.now() % 30000;
  if (msIntoWindow > 27000) await page.waitForTimeout(30000 - msIntoWindow + 500);
  await page.getByLabel("6-digit code").fill(totp(secret));
}

test("an admin joins from an invite link and sets up an authenticator", async ({ browser }) => {
  const token = await makeInvite(ADMIN.email, ADMIN.name, "admin");
  adminCtx = await browser.newContext();
  const page = await adminCtx.newPage();

  await page.goto(`/invite/${token}`);
  await expect(page.getByRole("heading", { name: "Join the IT team" })).toBeVisible();
  await expect(page.getByText(ADMIN.email)).toBeVisible();
  await shot(page, "01-invite");
  await page.getByLabel("New password").fill(ADMIN.password);
  await page.getByLabel("Type the password again").fill(ADMIN.password);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/setup-2fa$/);
  await page.getByLabel("Your password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Show my QR code" }).click();
  await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
  await shot(page, "02-authenticator");
  secret = (await page.locator("p:has-text('Enter this key instead') .mono").innerText()).trim();
  expect(secret).toMatch(/^[A-Z2-7]+=*$/);

  await enterCode(page);
  await page.getByRole("button", { name: "Verify and finish" }).click();
  await expect(page).toHaveURL(/\/it$/);
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Greg/ })).toBeVisible();
});

test("a member of staff signs up and raises a job with a screenshot, on a phone", async ({ browser }) => {
  staffCtx = await browser.newContext(PHONE);
  const page = await staffCtx.newPage();

  await page.goto("/sign-in");
  await shot(page, "03-sign-in-phone");
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Your name").fill(STAFF.name);
  await page.getByLabel("Work email").fill(STAFF.email);
  await page.getByLabel("Password", { exact: true }).fill(STAFF.password);
  await page.getByLabel("Type it again").fill(STAFF.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Hi Kirsty" })).toBeVisible();

  await page.getByRole("link", { name: "Raise a job" }).first().click();
  await page.getByLabel("What's the problem?").fill("Label printer printing blank labels");
  await page.getByLabel("Details").fill("Zebra on dispatch bench 2 prints blank labels since 8am. Bench 1 is fine.");
  await page.locator("#files").setInputFiles({ name: "labels.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "labels.png" })).toBeVisible();
  await page.getByLabel("Site").selectOption({ label: "Warehouse" });
  await page.getByLabel("Where exactly?").fill("Dispatch bench 2");
  await page.getByLabel("What's it about?").selectOption({ label: "Printer" });
  await page.locator("label", { hasText: "Critical" }).click();
  await page.getByLabel("Best number to reach you").fill("07700 900412");
  await shot(page, "04-raise-phone");
  await page.getByRole("button", { name: "Send to IT" }).click();

  await expect(page).toHaveURL(/\/my\/\d+\?new=1$/);
  await expect(page.getByText("Sent. IT has been told")).toBeVisible();
  ticketPath = new URL(page.url()).pathname;
});

test("staff can't open IT pages", async () => {
  const page = await staffCtx.newPage();
  await page.goto("/it");
  await expect(page).toHaveURL(/\/my$/);
  await page.goto("/it/settings");
  await expect(page).toHaveURL(/\/my$/);
  const res = await page.request.get("/api/files/999999");
  expect(res.status()).toBe(404);
});

test("IT sees the job in the queue, replies, adds a private note and resolves it", async () => {
  const page = await adminCtx.newPage();
  await page.goto("/it/tickets");
  await expect(page.getByText("Label printer printing blank labels")).toBeVisible();
  await shot(page, "05-queue-desktop");
  await page.getByText("Label printer printing blank labels").click();

  await expect(page.getByRole("heading", { name: "Label printer printing blank labels" })).toBeVisible();
  await expect(page.getByText("07700 900412")).toBeVisible();
  const img = page.locator(".thumbs img").first();
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);

  await page.getByLabel("Reply").fill("On my way over. Please use bench 1 for now.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".msg").filter({ hasText: "On my way over" })).toBeVisible();

  await page.getByRole("button", { name: "Internal note" }).click();
  await page.getByLabel("Internal note").fill("Printhead looks worn. Spare ZD421 in cupboard B.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.locator(".msg.internal").filter({ hasText: "Printhead looks worn" })).toBeVisible();

  await page.getByLabel("Hours").fill("0");
  await page.getByLabel("Minutes").fill("40");
  await page.getByRole("button", { name: "+ Log time" }).click();
  await expect(page.getByText("Logged: 40m")).toBeVisible();
  await shot(page, "06-ticket-desktop");

  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.locator(".page-head .chip.s-resolved")).toBeVisible();
});

test("the requester sees the reply but not the private note, and rates the fix", async () => {
  const page = await staffCtx.newPage();
  await page.goto(ticketPath);
  await expect(page.getByText("On my way over. Please use bench 1 for now.")).toBeVisible();
  await expect(page.getByText("Printhead looks worn")).toHaveCount(0);
  await page.locator(".stars label").nth(3).click();
  await page.getByRole("button", { name: "Send rating" }).click();
  // The page refreshes with the saved rating in place of the form.
  await expect(page.getByText("You rated this 4 out of 5")).toBeVisible();
  await shot(page, "07-job-phone");
});

test("signing in again needs the password and an authenticator code", async ({ browser }: { browser: Browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/verify/);

  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("That code didn't work")).toBeVisible();

  await enterCode(page);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/it$/);
  await ctx.close();
});

test("an admin invites a tech and changes the SLA targets", async () => {
  const page = await adminCtx.newPage();
  await page.goto("/it/settings");
  await page.getByLabel("Name", { exact: true }).fill("Jamie F");
  await page.getByLabel("Work email").fill("jamie@gardenersdream.co.uk");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("Invite sent to jamie@gardenersdream.co.uk")).toBeVisible();
  await expect(page.getByText("Waiting to accept")).toBeVisible();

  await page.getByLabel("P1 first response").fill("30");
  await page.getByRole("button", { name: "Save SLA targets" }).click();
  await expect(page.getByText("SLA targets saved")).toBeVisible();
  await expect(page.getByText("P1 respond 30 min")).toBeVisible();
  await expect(page.getByLabel("P3 counts")).toHaveValue("hours");

  // Winter hours: 7am to 6pm, still every day.
  await page.getByLabel("From", { exact: true }).fill("07:00");
  await page.getByLabel("Until", { exact: true }).fill("18:00");
  await page.getByRole("button", { name: "Save working hours" }).click();
  await expect(page.getByText(/Saved\. Deadlines on \d+ open jobs? have been updated\./)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("07:00");
  await shot(page, "08-settings-desktop");
});

test("dashboard reflects the work", async () => {
  const page = await adminCtx.newPage();
  await page.goto("/it");
  await expect(page.getByText("Average of 1 rating, out of 5")).toBeVisible();
  await shot(page, "09-dashboard-desktop");
  const phone = await adminCtx.browser()!.newContext({ ...PHONE, storageState: await adminCtx.storageState() });
  const p2 = await phone.newPage();
  await p2.goto("/it");
  await expect(p2.locator(".tabbar")).toBeVisible();
  await shot(p2, "10-dashboard-phone");
  await phone.close();
});

test("Slack: the IT channel and the requester were kept up to date, and the test button works", async ({ request }) => {
  type Call = { method: string; body: { channel?: string; text?: string; thread_ts?: string; blocks?: unknown } };
  const calls = (await (await request.get("http://localhost:3199/_calls")).json()) as Call[];
  const posts = calls.filter((c) => c.method === "chat.postMessage");
  const channel = posts.filter((c) => c.body.channel === "C0ITJOBS");
  const toKirsty = posts.filter((c) => c.body.channel === "UKIRSTY").map((c) => c.body.text);

  const announce = channel.find((c) => !c.body.thread_ts)!;
  expect(announce.body.text).toMatch(/^New job IT-\d+ \(P1\): Label printer printing blank labels$/);
  expect(JSON.stringify(announce.body.blocks)).toContain("raised by <@UKIRSTY>");
  const thread = channel.filter((c) => c.body.thread_ts === "1700000001.000100").map((c) => c.body.text);
  expect(thread).toContain("Greg J replied to the requester: On my way over. Please use bench 1 for now.");
  expect(thread).toContain("Greg J set the status to *Resolved*");
  expect(thread.some((t) => t?.startsWith("Kirsty P rated the fix ★★★★☆"))).toBe(true);
  expect(toKirsty[0]).toMatch(/^Got it\. IT has your job IT-\d+/);
  expect(toKirsty).toContainEqual(expect.stringContaining("Greg J replied on IT-"));
  expect(JSON.stringify(calls)).not.toContain("Printhead looks worn");

  const page = await adminCtx.newPage();
  await page.goto("/it/settings");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Send test message" }).click();
  await expect(page.getByText("Sent to the channel as @it_hub in Gardeners Dream.")).toBeVisible();
  await page.locator("section", { hasText: "Send test message" }).screenshot({ path: "test-results/screens/11-slack-settings.png" });
});
