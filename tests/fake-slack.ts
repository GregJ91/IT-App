// A stand-in for Slack's Web API and incoming webhooks. Records every request so tests
// can check exactly what would have been sent.
import { createServer, type Server } from "node:http";

export type SlackCall = { method: string; auth: string; body: Record<string, unknown> };

export const FAKE_TOKEN = "xoxb-test-token";
export const FAKE_CHANNEL = "C0ITJOBS";

export function startFakeSlack(port: number, people: Record<string, string>) {
  const calls: SlackCall[] = [];
  let ts = 1700000000;
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      };
      const url = new URL(req.url ?? "/", "http://x");
      if (req.method === "GET" && url.pathname === "/_calls") return send(200, calls);
      if (req.method === "DELETE" && url.pathname === "/_calls") {
        calls.length = 0;
        return send(200, { ok: true });
      }
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const method = url.pathname.replace(/^\/(api\/)?/, "");
      calls.push({ method, auth: String(req.headers.authorization ?? ""), body });
      if (method === "webhook") return send(200, { ok: true });
      if (req.headers.authorization !== `Bearer ${FAKE_TOKEN}`) return send(200, { ok: false, error: "invalid_auth" });
      switch (method) {
        case "auth.test":
          return send(200, { ok: true, team: "Gardeners Dream", user: "it_hub" });
        case "users.lookupByEmail": {
          const id = people[String(body.email).toLowerCase()];
          return send(200, id ? { ok: true, user: { id } } : { ok: false, error: "users_not_found" });
        }
        case "chat.postMessage": {
          const ch = String(body.channel);
          if (ch !== FAKE_CHANNEL && !Object.values(people).includes(ch)) return send(200, { ok: false, error: "channel_not_found" });
          return send(200, { ok: true, channel: ch, ts: `${++ts}.000100` });
        }
        default:
          return send(200, { ok: false, error: "unknown_method" });
      }
    });
  });
  return new Promise<{ calls: SlackCall[]; close: () => Promise<void> }>((resolve) =>
    server.listen(port, () => resolve({ calls, close: () => new Promise((r) => server.close(() => r())) })),
  );
}
