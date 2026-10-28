import type { TicketDetail } from "@/lib/tickets";
import { STATUS_LABEL, isStatus } from "@/lib/tickets-shared";
import { Avatar, when } from "./ui";

type Item =
  | { kind: "msg"; at: Date; m: TicketDetail["messages"][number] }
  | { kind: "event"; at: Date; e: TicketDetail["events"][number] };

function eventText(e: TicketDetail["events"][number], names: Map<string, string>) {
  const d = e.data as Record<string, unknown>;
  const who = e.actorName ?? "Someone";
  switch (e.type) {
    case "status": {
      const to = String(d.to);
      return d.reopened ? `${who} replied, so the job was reopened` : `${who} set the status to ${isStatus(to) ? STATUS_LABEL[to] : to}`;
    }
    case "assigned":
      return d.to ? `${who} assigned it to ${names.get(String(d.to)) ?? "someone"}` : `${who} unassigned it`;
    case "priority":
      return `${who} changed the priority from P${d.from} to P${d.to}`;
    case "rated":
      return `${who} rated the fix ${d.rating} out of 5`;
    default:
      return null;
  }
}

/** Messages and key changes in time order. Staff never receive internal notes from the server. */
export function Thread({ detail, it, assigneeNames }: { detail: TicketDetail; it: boolean; assigneeNames: Map<string, string> }) {
  const now = new Date();
  const items: Item[] = [
    ...detail.messages.map((m) => ({ kind: "msg" as const, at: m.createdAt, m })),
    ...detail.events.filter((e) => e.type !== "created" && e.type !== "category" && e.type !== "site").map((e) => ({ kind: "event" as const, at: e.createdAt, e })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const filesFor = (id: number) => detail.files.filter((f) => f.messageId === id);

  if (items.length === 0) return <p className="muted">No replies yet.</p>;
  return (
    <div className="thread">
      {items.map((it2) => {
        if (it2.kind === "event") {
          const text = eventText(it2.e, assigneeNames);
          return text ? (
            <p key={`e${it2.e.id}`} className="event">
              {text} · {when(it2.at, now)}
            </p>
          ) : null;
        }
        const m = it2.m;
        const files = filesFor(m.id);
        return (
          <div key={`m${m.id}`} className={`msg ${m.internal ? "internal" : ""}`}>
            <Avatar name={m.authorName} />
            <div className="bubble">
              <div className="h">
                <strong>{m.authorName ?? "Deleted user"}</strong>
                <span>{when(m.createdAt, now)}</span>
                {it && <span>{m.internal ? "Internal note, staff can't see this" : m.authorRole === "staff" ? "From requester" : "Reply to requester"}</span>}
              </div>
              {m.body && <p className="desc">{m.body}</p>}
              {files.length > 0 && (
                <div className="thumbs">
                  {files.map((f) => (
                    <a key={f.id} className="thumb" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">
                      <img src={`/api/files/${f.id}`} alt={f.filename} loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Screenshots({ detail }: { detail: TicketDetail }) {
  const files = detail.files.filter((f) => f.messageId === null);
  if (!files.length) return null;
  return (
    <div className="thumbs">
      {files.map((f) => (
        <a key={f.id} className="thumb" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">
          <img src={`/api/files/${f.id}`} alt={f.filename} loading="lazy" />
        </a>
      ))}
    </div>
  );
}
