// Slack notifications. Two ways to connect:
//  - Bot token (SLACK_BOT_TOKEN + SLACK_CHANNEL): posts to the IT channel, keeps each job's
//    updates in one thread, and sends people direct messages about their own jobs.
//  - Incoming webhook (SLACK_WEBHOOK_URL): posts to one channel only. No threads, no DMs.
// Nothing here ever throws: a Slack problem must not stop a ticket being saved.

export type SlackBlock = Record<string, unknown>;
export type SlackMessage = { text: string; blocks?: SlackBlock[] };

const apiBase = () => process.env.SLACK_API_BASE ?? "https://slack.com/api";
const token = () => process.env.SLACK_BOT_TOKEN?.trim() || "";
const channel = () => process.env.SLACK_CHANNEL?.trim() || "";
const webhook = () => process.env.SLACK_WEBHOOK_URL?.trim() || "";

export type SlackMode = "bot" | "webhook" | "off";

export function slackMode(): SlackMode {
  if (token() && channel()) return "bot";
  if (webhook()) return "webhook";
  return "off";
}

export function slackChannelName() {
  return channel();
}

class SlackApiError extends Error {}

async function call<T = Record<string, unknown>>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${apiBase()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (!res.ok || !json.ok) throw new SlackApiError(json.error ?? `HTTP ${res.status}`);
  return json;
}

async function safely<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[slack] ${what} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Escapes text for Slack's mrkdwn so names and titles can't inject links or mentions. */
export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function clip(s: string, n: number) {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/* ---------- people ---------- */

const idCache = new Map<string, { id: string | null; at: number }>();
const ID_TTL = 60 * 60 * 1000;

/** The Slack user with this email address, if the bot can see them. */
export async function slackUserId(email: string) {
  if (slackMode() !== "bot") return null;
  const key = email.toLowerCase();
  const hit = idCache.get(key);
  if (hit && Date.now() - hit.at < ID_TTL) return hit.id;
  const res = await safely("users.lookupByEmail", () =>
    call<{ user: { id: string } }>("users.lookupByEmail", { email: key }),
  );
  const id = res?.user.id ?? null;
  idCache.set(key, { id, at: Date.now() });
  return id;
}

/** "<@U123>" when we can find them in Slack, otherwise their name. */
export async function mention(name: string, email: string | null) {
  const id = email ? await slackUserId(email) : null;
  return id ? `<@${id}>` : esc(name);
}

/* ---------- sending ---------- */

/** Posts to the IT channel. Returns the message reference for threading (bot mode only). */
export async function postToChannel(msg: SlackMessage, threadTs?: string | null) {
  const mode = slackMode();
  if (mode === "bot") {
    const res = await safely("chat.postMessage", () =>
      call<{ ts: string; channel: string }>("chat.postMessage", {
        channel: channel(),
        text: msg.text,
        blocks: msg.blocks,
        unfurl_links: false,
        ...(threadTs ? { thread_ts: threadTs } : {}),
      }),
    );
    return res ? { ts: res.ts, channel: res.channel } : null;
  }
  if (mode === "webhook") {
    // Webhooks can't thread, so thread replies are skipped to keep the channel quiet.
    if (threadTs !== undefined) return null;
    await safely("webhook", async () => {
      const res = await fetch(webhook(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg.text, blocks: msg.blocks }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });
  }
  return null;
}

/** Direct message to one person, found by their email address. Bot mode only. */
export async function directMessage(email: string, msg: SlackMessage) {
  const id = await slackUserId(email);
  if (!id) return false;
  const res = await safely("chat.postMessage (DM)", () =>
    call("chat.postMessage", { channel: id, text: msg.text, blocks: msg.blocks, unfurl_links: false }),
  );
  return !!res;
}

/** Used by the Settings test button. Explains what's wrong in plain words. */
export async function sendTestMessage(byName: string): Promise<{ ok: boolean; detail: string }> {
  const mode = slackMode();
  if (mode === "off") return { ok: false, detail: "Slack isn't connected yet. Add the Slack settings to the server and restart it." };
  const text = `Test from IT Hub, sent by ${esc(byName)}. New jobs and updates will appear in this channel.`;
  if (mode === "webhook") {
    try {
      const res = await fetch(webhook(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok ? { ok: true, detail: "Sent through the webhook. Check the channel." } : { ok: false, detail: `Slack said no (HTTP ${res.status}). Check the webhook address.` };
    } catch {
      return { ok: false, detail: "Couldn't reach Slack from the server." };
    }
  }
  try {
    const who = await call<{ team: string; user: string }>("auth.test", {});
    await call("chat.postMessage", { channel: channel(), text });
    return { ok: true, detail: `Sent to the channel as @${who.user} in ${who.team}.` };
  } catch (err) {
    const code = err instanceof SlackApiError ? err.message : "network";
    const why: Record<string, string> = {
      invalid_auth: "The bot token isn't valid. Copy the Bot User OAuth Token again.",
      not_authed: "No bot token was sent.",
      account_inactive: "The Slack app has been uninstalled or disabled.",
      channel_not_found: "Couldn't find the channel. Use the channel ID (starts with C) and check the app can see it.",
      not_in_channel: "The app isn't in the channel yet. In Slack, type /invite @IT Hub in the channel.",
      missing_scope: "The app is missing a permission. Reinstall it using the manifest in docs/slack-setup.md.",
      network: "Couldn't reach Slack from the server.",
    };
    return { ok: false, detail: why[code] ?? `Slack said: ${code}` };
  }
}
