import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { esc, sendTestMessage, slackMode } from "@/lib/slack";
import { addMessage, createTicket, rateTicket, updateTicket } from "@/lib/tickets";
import { FAKE_CHANNEL, FAKE_TOKEN, startFakeSlack, type SlackCall } from "../fake-slack";
import { makeUser, resetData } from "./db-helpers";

vi.spyOn(console, "log").mockImplementation(() => {}); // printed emails
vi.spyOn(console, "error").mockImplementation(() => {}); // expected Slack failures

const PORT = 3198;
const people = { "kirsty.p@gardenersdream.co.uk": "UKIRSTY", "greg.j@gardenersdream.co.uk": "UGREG" };
let fake: Awaited<ReturnType<typeof startFakeSlack>>;
let base: Awaited<ReturnType<typeof resetData>>;

beforeAll(async () => {
  fake = await startFakeSlack(PORT, people);
});
afterAll(async () => {
  await fake.close();
});
beforeEach(async () => {
  base = await resetData();
  fake.calls.length = 0;
  process.env.SLACK_API_BASE = `http://localhost:${PORT}/api`;
  process.env.SLACK_BOT_TOKEN = FAKE_TOKEN;
  process.env.SLACK_CHANNEL = FAKE_CHANNEL;
  delete process.env.SLACK_WEBHOOK_URL;
});

const posts = (to?: string) =>
  fake.calls.filter((c) => c.method === "chat.postMessage" && (!to || c.body.channel === to)).map((c) => c.body);
const json = (c: unknown) => JSON.stringify(c);

async function raise(kirsty: Awaited<ReturnType<typeof makeUser>>) {
  return createTicket(
    kirsty,
    {
      title: "Label printer printing blank labels",
      description: "Since 8am <b>urgent</b>",
      priority: 1,
      categoryId: base.cats[0].id,
      siteId: base.sites[1].id,
      location: "Dispatch bench 2",
      contactPhone: "07700 900412",
    },
    [],
  );
}

describe("Slack with a bot token", () => {
  it("announces a new job in the IT channel and remembers the thread", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const greg = await makeUser("Greg J", "tech");
    await db.insert(schema.assignmentRule).values({ assigneeId: greg.id, position: 1 });
    const t = await raise(kirsty);

    const [announce] = posts(FAKE_CHANNEL);
    expect(announce.text).toContain(`IT-${t.id}`);
    expect(json(announce.blocks)).toContain("raised by <@UKIRSTY>");
    expect(json(announce.blocks)).toContain("Assigned to <@UGREG>");
    expect(json(announce.blocks)).toContain("Warehouse, Dispatch bench 2");
    // Text from users is escaped so it can't become a link or mention.
    expect(json(announce.blocks)).toContain("&lt;b&gt;urgent&lt;/b&gt;");
    expect(json(announce.blocks)).toContain(`/it/tickets/${t.id}`);

    const row = await db.query.ticket.findFirst({ where: eq(schema.ticket.id, t.id) });
    expect(row?.slackChannel).toBe(FAKE_CHANNEL);
    expect(row?.slackTs).toMatch(/^\d+\.\d+$/);

    // The requester and the assignee each get a direct message.
    expect(posts("UKIRSTY")[0].text).toContain("Got it");
    expect(json(posts("UGREG")[0])).toContain("assigned");
  });

  it("puts updates in the job's thread and messages the requester", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const greg = await makeUser("Greg J", "tech");
    const t = await raise(kirsty);
    const ts = (await db.query.ticket.findFirst({ where: eq(schema.ticket.id, t.id) }))!.slackTs;
    fake.calls.length = 0;

    await addMessage(t.id, greg, "On my way over.", false, []);
    await addMessage(t.id, greg, "Printhead looks worn. SECRET-NOTE", true, []);
    await updateTicket(t.id, greg, { status: "resolved", assigneeId: greg.id });
    await rateTicket(t.id, kirsty, 4, "Quick, thanks");

    const thread = posts(FAKE_CHANNEL);
    expect(thread.every((p) => p.thread_ts === ts)).toBe(true);
    expect(thread.map((p) => p.text)).toEqual([
      "Greg J replied to the requester: On my way over.",
      "Greg J set the status to *Resolved*\nGreg J assigned it to <@UGREG>",
      'Kirsty P rated the fix ★★★★☆: "Quick, thanks"',
    ]);

    const toKirsty = posts("UKIRSTY").map((p) => p.text);
    expect(toKirsty).toEqual([
      "Greg J replied on IT-" + t.id + ": On my way over.",
      `IT-${t.id} Resolved: IT has marked this as fixed. If it isn't, reply and it will reopen.`,
    ]);

    // Internal notes never leave the app.
    expect(json(fake.calls)).not.toContain("SECRET-NOTE");
  });

  it("tells IT when the requester replies, in the thread", async () => {
    const kirsty = await makeUser("Kirsty P", "staff");
    const t = await raise(kirsty);
    fake.calls.length = 0;
    await addMessage(t.id, kirsty, "Still blank after restart", false, []);
    expect(posts(FAKE_CHANNEL).map((p) => p.text)).toEqual(["Kirsty P replied: Still blank after restart"]);
    expect(posts("UKIRSTY")).toHaveLength(0);
  });

  it("skips direct messages for people it can't find in Slack", async () => {
    const mark = await makeUser("Mark D", "staff");
    await raise(mark);
    expect(posts(FAKE_CHANNEL)).toHaveLength(1);
    expect(json(posts(FAKE_CHANNEL)[0].blocks)).toContain("raised by Mark D");
    expect(posts().length).toBe(1);
  });

  it("still saves the ticket when Slack is down or the token is wrong", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-wrong";
    const kirsty = await makeUser("Kirsty P", "staff");
    const t = await raise(kirsty);
    expect(t.id).toBeGreaterThan(0);
    process.env.SLACK_API_BASE = "http://localhost:1/api"; // nothing listening
    const t2 = await raise(kirsty);
    expect(t2.id).toBe(t.id + 1);
  });

  it("explains test-message problems in plain words", async () => {
    expect(await sendTestMessage("Greg J")).toEqual({ ok: true, detail: "Sent to the channel as @it_hub in Gardeners Dream." });
    process.env.SLACK_CHANNEL = "CWRONG";
    expect((await sendTestMessage("Greg J")).detail).toMatch(/Couldn't find the channel/);
    process.env.SLACK_BOT_TOKEN = "xoxb-wrong";
    expect((await sendTestMessage("Greg J")).detail).toMatch(/bot token isn't valid/);
  });
});

describe("Slack with a webhook", () => {
  beforeEach(() => {
    delete process.env.SLACK_BOT_TOKEN;
    process.env.SLACK_WEBHOOK_URL = `http://localhost:${PORT}/webhook`;
  });

  it("posts new jobs only, with no threads or direct messages", async () => {
    expect(slackMode()).toBe("webhook");
    const kirsty = await makeUser("Kirsty P", "staff");
    const greg = await makeUser("Greg J", "tech");
    const t = await raise(kirsty);
    await addMessage(t.id, greg, "On my way", false, []);
    await updateTicket(t.id, greg, { status: "resolved" });
    expect(fake.calls.map((c) => c.method)).toEqual(["webhook"]);
    expect(json(fake.calls[0].body)).toContain("raised by Kirsty P");
  });
});

describe("Slack switched off", () => {
  it("sends nothing", async () => {
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_WEBHOOK_URL;
    const kirsty = await makeUser("Kirsty P", "staff");
    await raise(kirsty);
    expect(fake.calls).toHaveLength(0);
    expect((await sendTestMessage("Greg J")).ok).toBe(false);
  });
});

describe("esc", () => {
  it("neutralises Slack control characters", () => {
    expect(esc("<!channel> & <https://x|y>")).toBe("&lt;!channel&gt; &amp; &lt;https://x|y&gt;");
  });
});
