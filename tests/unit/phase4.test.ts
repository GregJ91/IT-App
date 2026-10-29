import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { Markdown, parseBlocks, safeHref, safeImage } from "@/components/markdown";
import { checkOut, createAsset, getAsset, type AssetInput } from "@/lib/assets";
import { feedbackStats, recordFeedback, saveArticle, searchArticles, slugify, suggestArticles, toOrQuery } from "@/lib/help";
import { addKitTask, addTask, addTemplateTask, createChange, getChange, listChanges, removeTask, setChangeStatus, setTaskDone, templateTasks, upcomingChanges } from "@/lib/people";
import { addDays, comingUp, sendDailyReminders, ukToday } from "@/lib/reminders";
import { makeUser, resetData } from "./db-helpers";

const mails: string[] = [];
vi.spyOn(console, "log").mockImplementation((m: string) => void mails.push(String(m)));

let base: Awaited<ReturnType<typeof resetData>>;
beforeEach(async () => {
  base = await resetData();
  mails.length = 0;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_WEBHOOK_URL;
});

const kit = (name: string, over: Partial<AssetInput> = {}): AssetInput => ({
  name,
  typeId: base.types[0].id,
  make: "Dell",
  model: "Latitude 5440",
  serial: "",
  status: "spare",
  siteId: base.sites[0].id,
  location: "IT cupboard",
  ipAddress: "",
  macAddress: "",
  purchaseDate: null,
  purchaseCostPence: null,
  supplier: "",
  warrantyUntil: null,
  notes: "",
  ...over,
});

const person = (over: Partial<Parameters<typeof createChange>[1]> = {}) => ({
  kind: "starter" as const,
  name: "Jamie Fox",
  email: "jamie.fox@gardenersdream.co.uk",
  jobTitle: "Dispatch",
  siteId: base.sites[1].id,
  manager: "Dave K",
  date: addDays(ukToday(), 5),
  notes: "",
  ...over,
});

describe("starters and leavers", () => {
  it("starts from the standard checklist plus the chosen kit", async () => {
    const greg = await makeUser("Greg J", "admin");
    const laptop = await createAsset(greg, kit("Laptop A"));
    const c = await createChange(greg, person(), [laptop.id]);
    const d = (await getChange(c.id))!;
    const standard = await templateTasks("starter");
    expect(standard.length).toBeGreaterThan(3);
    expect(d.tasks.filter((t) => t.kind === "task").map((t) => t.title)).toEqual(standard.map((t) => t.title));
    expect(d.tasks.filter((t) => t.kind === "kit_out").map((t) => t.title)).toEqual([`Hand out ${laptop.tag} Laptop A`]);
    expect(d.status).toBe("open");
  });

  it("hands kit out and back through the inventory as tasks are ticked", async () => {
    const greg = await makeUser("Greg J", "admin");
    const laptop = await createAsset(greg, kit("Laptop A"));
    const c = await createChange(greg, person(), [laptop.id]);
    const task = (await getChange(c.id))!.tasks.find((t) => t.kind === "kit_out")!;

    await setTaskDone(greg, task.id, true);
    let a = (await getAsset(laptop.id))!.a;
    expect(a.status).toBe("in_use");
    expect(a.assignedTo).toBe("Jamie Fox");

    // Unticking puts it back, so the inventory matches the list.
    await setTaskDone(greg, task.id, false);
    a = (await getAsset(laptop.id))!.a;
    expect(a.status).toBe("spare");
    expect(a.assignedTo).toBe("");
    expect(a.siteId).toBe(base.sites[1].id);
  });

  it("links a starter's kit to their account once they've signed up", async () => {
    const greg = await makeUser("Greg J", "admin");
    const laptop = await createAsset(greg, kit("Laptop A"));
    const c = await createChange(greg, person(), [laptop.id]);
    expect((await getChange(c.id))!.userId).toBeNull();
    const jamie = await makeUser("Jamie Fox", "staff");
    const task = (await getChange(c.id))!.tasks.find((t) => t.kind === "kit_out")!;
    await setTaskDone(greg, task.id, true);
    expect((await getAsset(laptop.id))!.a.assignedUserId).toBe(jamie.id);
    expect((await getChange(c.id))!.userId).toBe(jamie.id);
  });

  it("a leaver's list includes everything they have, and collecting checks it in", async () => {
    const greg = await makeUser("Greg J", "admin");
    const sam = await makeUser("Sam M", "staff");
    const laptop = await createAsset(greg, kit("Laptop B"));
    const phone = await createAsset(greg, kit("Phone B"));
    const old = await createAsset(greg, kit("Old phone"));
    await checkOut(greg, laptop.id, { userId: sam.id, name: "" });
    await checkOut(greg, phone.id, { userId: null, name: "Sam M" });
    const c = await createChange(greg, person({ kind: "leaver", name: "Sam M", email: sam.email }));
    let d = (await getChange(c.id))!;
    expect(d.userId).toBe(sam.id);
    expect(d.tasks.filter((t) => t.kind === "kit_back").map((t) => t.assetId).sort()).toEqual([laptop.id, phone.id].sort());

    // Kit given out after the leaver was added shows as "still has".
    await checkOut(greg, old.id, { userId: sam.id, name: "" });
    d = (await getChange(c.id))!;
    expect(d.alsoHolding.map((a) => a.id)).toEqual([old.id]);
    await addKitTask(greg, c.id, old.id);
    await expect(addKitTask(greg, c.id, old.id)).rejects.toThrow(/already on the list/);
    d = (await getChange(c.id))!;
    expect(d.alsoHolding).toEqual([]);

    for (const t of d.tasks.filter((t) => t.kind === "kit_back")) await setTaskDone(greg, t.id, true);
    for (const id of [laptop.id, phone.id, old.id]) {
      const a = (await getAsset(id))!.a;
      expect([a.status, a.assignedUserId, a.assignedTo]).toEqual(["spare", null, ""]);
    }
  });

  it("finishes itself when everything's ticked, and reopens if something's unticked", async () => {
    const greg = await makeUser("Greg J", "admin");
    const c = await createChange(greg, person());
    await addTask(greg, c.id, "Order a headset");
    const d = (await getChange(c.id))!;
    expect(d.tasks.at(-1)!.title).toBe("Order a headset");
    for (const t of d.tasks) await setTaskDone(greg, t.id, true);
    expect((await getChange(c.id))!.status).toBe("done");
    expect((await listChanges("done")).map((x) => x.id)).toEqual([c.id]);
    await setTaskDone(greg, d.tasks[0].id, false);
    expect((await getChange(c.id))!.status).toBe("open");
  });

  it("won't remove ticked kit until it's unticked, and cancelled lists can't be ticked", async () => {
    const greg = await makeUser("Greg J", "admin");
    const laptop = await createAsset(greg, kit("Laptop A"));
    const c = await createChange(greg, person(), [laptop.id]);
    const task = (await getChange(c.id))!.tasks.find((t) => t.kind === "kit_out")!;
    await setTaskDone(greg, task.id, true);
    await expect(removeTask(greg, task.id)).rejects.toThrow(/Untick it first/);
    await setChangeStatus(greg, c.id, "cancelled");
    await expect(setTaskDone(greg, task.id, false)).rejects.toThrow(/cancelled/);
    expect(await upcomingChanges()).toEqual([]);
  });

  it("checks the details and who's asking", async () => {
    const greg = await makeUser("Greg J", "admin");
    const kirsty = await makeUser("Kirsty P", "staff");
    await expect(createChange(kirsty, person())).rejects.toThrow(/IT team/);
    await expect(createChange(greg, person({ name: " " }))).rejects.toThrow(/name/);
    await expect(createChange(greg, person({ date: "" }))).rejects.toThrow(/first day/);
    await expect(createChange(greg, person({ kind: "leaver", date: "" }))).rejects.toThrow(/last day/);
    await expect(createChange(greg, person({ email: "jamie" }))).rejects.toThrow(/email/);
  });

  it("new checklist items apply to people added afterwards", async () => {
    const greg = await makeUser("Greg J", "admin");
    await addTemplateTask(greg, "leaver", "Collect their door fob");
    const c = await createChange(greg, person({ kind: "leaver" }));
    expect((await getChange(c.id))!.tasks.map((t) => t.title)).toContain("Collect their door fob");
    await db.delete(schema.peopleTemplateTask).where(eq(schema.peopleTemplateTask.title, "Collect their door fob"));
  });

  it("shows on the dashboard and in the daily reminder a week before, the day before and on the day", async () => {
    const greg = await makeUser("Greg J", "admin");
    const today = ukToday();
    await createChange(greg, person({ name: "In a week", date: addDays(today, 7) }));
    await createChange(greg, person({ name: "In five days", date: addDays(today, 5) }));
    await createChange(greg, person({ kind: "leaver", name: "Tomorrow", date: addDays(today, 1) }));
    await createChange(greg, person({ name: "Next month", date: addDays(today, 30) }));
    const soon = await comingUp();
    expect(soon.people.map((p) => p.name)).toEqual(["Tomorrow", "In five days", "In a week"]);
    const res = await sendDailyReminders();
    expect(res.lines?.filter((l) => /Starter|Leaver/.test(l))).toEqual([
      `Leaver Tomorrow leaves tomorrow: ${(await templateTasks("leaver")).length} of ${(await templateTasks("leaver")).length} jobs left`,
      `Starter In a week starts in 7 days: ${(await templateTasks("starter")).length} of ${(await templateTasks("starter")).length} jobs left`,
    ]);
  });
});

describe("help articles", () => {
  const article = (over: Partial<Parameters<typeof saveArticle>[2]> = {}) => ({
    title: "Printer printing blank labels",
    summary: "Reload the roll and recalibrate",
    body: "## Steps\n\n1. Open the lid\n2. Hold **feed** for 3 seconds",
    categoryId: base.cats[0].id,
    published: true,
    ...over,
  });

  it("gives each article a tidy, unique address that stays put once published", async () => {
    const greg = await makeUser("Greg J", "admin");
    expect(slugify("Connect to the office Wi-Fi!")).toBe("connect-to-the-office-wi-fi");
    const a = await saveArticle(greg, null, article());
    const b = await saveArticle(greg, null, article());
    expect([a.slug, b.slug]).toEqual(["printer-printing-blank-labels", "printer-printing-blank-labels-2"]);
    const renamed = await saveArticle(greg, a.id, article({ title: "Blank labels" }));
    expect(renamed.slug).toBe(a.slug);
    const draft = await saveArticle(greg, null, article({ title: "Draft one", published: false }));
    expect((await saveArticle(greg, draft.id, article({ title: "Draft two", published: false }))).slug).toBe("draft-two");
  });

  it("only IT can write them, and a published one needs some content", async () => {
    const greg = await makeUser("Greg J", "admin");
    const kirsty = await makeUser("Kirsty P", "staff");
    await expect(saveArticle(kirsty, null, article())).rejects.toThrow(/IT team/);
    await expect(saveArticle(greg, null, article({ body: " " }))).rejects.toThrow(/Write something/);
    await expect(saveArticle(greg, null, article({ title: "" }))).rejects.toThrow(/title/);
  });

  it("finds articles from loose wording, and only suggests published ones", async () => {
    const greg = await makeUser("Greg J", "admin");
    await saveArticle(greg, null, article());
    await saveArticle(greg, null, article({ title: "Connect to the Wi-Fi", summary: "Staff and guest networks", body: "Choose **GD-Staff** and enter the password from the card." }));
    await saveArticle(greg, null, article({ title: "Reset your password", body: "Go to the sign-in page and choose Forgot password.", published: false }));
    expect(toOrQuery("The label printer isn't working!")).toBe("the | label | printer | isn | working");
    expect(toOrQuery("!!")).toBeNull();

    const s = await suggestArticles("dispatch label printer gives blank labels");
    expect(s.map((a) => a.title)).toEqual(["Printer printing blank labels"]);
    expect(s[0].body).toContain("Open the lid");
    // The draft about passwords isn't suggested; the Wi-Fi one mentions a password, so it is.
    expect((await suggestArticles("forgot my password")).map((a) => a.title)).toEqual(["Connect to the Wi-Fi"]);
    expect((await searchArticles("password")).map((a) => a.title)).toEqual(["Reset your password", "Connect to the Wi-Fi"]);
    expect((await searchArticles("wifi")).length + (await searchArticles("Wi-Fi")).length).toBeGreaterThan(0);
    expect((await searchArticles("", { publishedOnly: true })).map((a) => a.title).sort()).toEqual(["Connect to the Wi-Fi", "Printer printing blank labels"]);
    expect(await suggestArticles("hi")).toEqual([]);
  });

  it("counts one answer per person, and remembers jobs that didn't need raising", async () => {
    const greg = await makeUser("Greg J", "admin");
    const kirsty = await makeUser("Kirsty P", "staff");
    const dave = await makeUser("Dave K", "staff");
    const a = await saveArticle(greg, null, article());
    await recordFeedback(kirsty.id, a.id, true, true);
    await recordFeedback(kirsty.id, a.id, true);
    await recordFeedback(dave.id, a.id, false);
    await recordFeedback(dave.id, a.id, false);
    expect((await feedbackStats()).get(a.id)).toEqual({ yes: 1, no: 1, solved: 1 });
    await recordFeedback(kirsty.id, a.id, false);
    expect((await feedbackStats()).get(a.id)).toEqual({ yes: 0, no: 2, solved: 0 });
  });
});

describe("article formatting", () => {
  it("turns simple Markdown into blocks", () => {
    expect(parseBlocks("# Title\n\nOne\ntwo\n\n- a\n- b\n\n1. x\n2. y\n\n> tip\n\n```\ncode\n```\n\n---\n\n![shot](/api/help-images/4)").map((b) => b.t)).toEqual(["h", "p", "ul", "ol", "tip", "code", "hr", "img"]);
  });

  it("can't be used to inject markup, scripts or odd links", () => {
    const html = renderToStaticMarkup(
      Markdown({
        source: '<script>alert(1)</script>\n\n[click](javascript:alert(1)) [ok](https://example.com) [page](/my/new)\n\n![x](javascript:alert(1))\n\n![y](/api/help-images/7)\n\n**bold _and_ `code`**',
      }),
    );
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noreferrer">ok</a>');
    expect(html).toContain('<a href="/my/new">page</a>');
    expect(html).toContain('<img src="/api/help-images/7" alt="y" loading="lazy"/>');
    expect(html).toContain("<strong>bold <em>and</em> <code>code</code></strong>");
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeImage("http://example.com/a.png")).toBeNull();
  });
});
