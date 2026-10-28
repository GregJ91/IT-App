// Tells people about ticket changes, by email and Slack.
// Internal notes are never sent anywhere outside the app.
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { link, sendMail } from "./notify";
import type { Actor } from "./roles";
import { clip, directMessage, esc, mention, postToChannel, slackMode, type SlackMessage } from "./slack";
import { STATUS_LABEL, ticketRef, type Status } from "./tickets-shared";

type Ticket = typeof schema.ticket.$inferSelect;

const PRIORITY_NAME: Record<number, string> = { 1: "Critical", 2: "High", 3: "Normal", 4: "Low" };

async function person(id: string | null) {
  if (!id) return null;
  return (await db.query.user.findFirst({ where: eq(schema.user.id, id), columns: { name: true, email: true } })) ?? null;
}

async function itEmails() {
  const rows = await db.select({ email: schema.user.email }).from(schema.user).where(inArray(schema.user.role, ["tech", "admin"]));
  return rows.map((r) => r.email);
}

const itLink = (id: number) => link(`/it/tickets/${id}`);
const staffLink = (id: number) => link(`/my/${id}`);
const button = (label: string, url: string) => ({
  type: "actions",
  elements: [{ type: "button", text: { type: "plain_text", text: label }, url }],
});
const plain = (text: string): SlackMessage => ({ text, blocks: [{ type: "section", text: { type: "mrkdwn", text } }] });

/** A one-line update in the job's thread in the IT channel. */
async function threadUpdate(t: Ticket, text: string) {
  if (!t.slackTs) return;
  await postToChannel({ text }, t.slackTs);
}

export async function ticketCreated(t: Ticket, requester: Actor, files: number) {
  const ref = ticketRef(t.id);
  const assignee = await person(t.assigneeId);
  const site = t.siteId ? await db.query.site.findFirst({ where: eq(schema.site.id, t.siteId) }) : null;
  const where = [site?.name, t.location].filter(Boolean).join(", ");

  await sendMail({
    to: assignee ? assignee.email : await itEmails(),
    subject: `[${ref}] P${t.priority} ${t.title}`,
    text: `${requester.name} raised a job${assignee ? " and it was assigned to you" : ""}.\n\n${t.title}\n\n${t.description}\n\nContact: ${t.contactPhone || "not given"}\nOpen: ${itLink(t.id)}`,
  });
  await sendMail({
    to: requester.email,
    subject: `[${ref}] We've got your request`,
    text: `Thanks, ${requester.name}. IT has your job "${t.title}".\n\nTrack it here: ${staffLink(t.id)}`,
  });

  if (slackMode() === "off") return;
  const who = await mention(requester.name, requester.email);
  const owner = assignee ? `Assigned to ${await mention(assignee.name, assignee.email)}` : "Unassigned";
  const headline = `*<${itLink(t.id)}|${ref} · ${esc(clip(t.title, 120))}>*`;
  const facts = [`P${t.priority} ${PRIORITY_NAME[t.priority] ?? ""}`, `raised by ${who}`, where && esc(where)].filter(Boolean).join(" · ");
  const posted = await postToChannel({
    text: `New job ${ref} (P${t.priority}): ${clip(t.title, 120)}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `${headline}\n${facts}\n>${esc(clip(t.description, 280))}` } },
      { type: "context", elements: [{ type: "mrkdwn", text: [owner, files ? `${files} screenshot${files > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ") }] },
      button("Open ticket", itLink(t.id)),
    ],
  });
  if (posted) {
    await db.update(schema.ticket).set({ slackChannel: posted.channel, slackTs: posted.ts }).where(eq(schema.ticket.id, t.id));
  }
  await directMessage(requester.email, {
    text: `Got it. IT has your job ${ref}: ${clip(t.title, 120)}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `Got it. IT has your job *${ref}: ${esc(clip(t.title, 120))}*. I'll message you here when there's an update.` } },
      button("Track it", staffLink(t.id)),
    ],
  });
  if (assignee) {
    await directMessage(assignee.email, plain(`You've been assigned *<${itLink(t.id)}|${ref}: ${esc(clip(t.title, 120))}>* (P${t.priority}), raised by ${esc(requester.name)}.`));
  }
}

export async function ticketChanged(before: Ticket, after: Ticket, actor: Actor) {
  const ref = ticketRef(after.id);
  const requester = await person(after.requesterId);
  const statusChanged = before.status !== after.status;

  if (statusChanged && requester && ["waiting", "resolved", "closed"].includes(after.status)) {
    const what =
      after.status === "waiting"
        ? "IT needs something from you to carry on."
        : after.status === "resolved"
          ? "IT has marked this as fixed. If it isn't, reply and it will reopen."
          : "This job is now closed.";
    await sendMail({
      to: requester.email,
      subject: `[${ref}] ${STATUS_LABEL[after.status as Status]}: ${after.title}`,
      text: `${what}\n\n${staffLink(after.id)}`,
    });
    await directMessage(requester.email, {
      text: `${ref} ${STATUS_LABEL[after.status as Status]}: ${what}`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*${ref}: ${esc(clip(after.title, 120))}*\n${what}` } },
        button(after.status === "waiting" ? "Reply" : "Open job", staffLink(after.id)),
      ],
    });
  }

  const assigneeChanged = before.assigneeId !== after.assigneeId;
  const assignee = assigneeChanged ? await person(after.assigneeId) : null;
  if (assignee && after.assigneeId !== actor.id) {
    await sendMail({
      to: assignee.email,
      subject: `[${ref}] Assigned to you: ${after.title}`,
      text: `${actor.name} assigned you ${ref}.\n\n${itLink(after.id)}`,
    });
    await directMessage(assignee.email, plain(`${esc(actor.name)} assigned you *<${itLink(after.id)}|${ref}: ${esc(clip(after.title, 120))}>* (P${after.priority}).`));
  }

  const lines: string[] = [];
  if (statusChanged) lines.push(`${esc(actor.name)} set the status to *${STATUS_LABEL[after.status as Status]}*`);
  if (assigneeChanged) lines.push(assignee ? `${esc(actor.name)} assigned it to ${await mention(assignee.name, assignee.email)}` : `${esc(actor.name)} unassigned it`);
  if (before.priority !== after.priority) lines.push(`${esc(actor.name)} changed the priority from P${before.priority} to P${after.priority}`);
  if (lines.length) await threadUpdate(after, lines.join("\n"));
}

export async function messageAdded(t: Ticket, actor: Actor, body: string, internal: boolean, fromIT: boolean) {
  if (internal) return; // IT-only notes stay in the app
  const ref = ticketRef(t.id);
  const excerpt = clip(body, 400);
  if (fromIT) {
    const requester = await person(t.requesterId);
    if (!requester) return;
    await sendMail({
      to: requester.email,
      subject: `[${ref}] New reply: ${t.title}`,
      text: `${actor.name} replied:\n\n${body.trim()}\n\nReply here: ${staffLink(t.id)}`,
    });
    await directMessage(requester.email, {
      text: `${actor.name} replied on ${ref}: ${excerpt}`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*${esc(actor.name)}* replied on *${ref}: ${esc(clip(t.title, 120))}*\n>${esc(excerpt)}` } },
        button("Reply", staffLink(t.id)),
      ],
    });
    await threadUpdate(t, `${esc(actor.name)} replied to the requester: ${esc(clip(body, 200))}`);
    return;
  }
  const assignee = await person(t.assigneeId);
  await sendMail({
    to: assignee ? assignee.email : await itEmails(),
    subject: `[${ref}] ${actor.name} replied: ${t.title}`,
    text: `${body.trim()}\n\n${itLink(t.id)}`,
  });
  await threadUpdate(t, `${esc(actor.name)} replied${assignee ? ` (cc ${await mention(assignee.name, assignee.email)})` : ""}: ${esc(clip(body, 300))}`);
}

export async function ticketRated(t: Ticket, actor: Actor, rating: number, comment: string) {
  await threadUpdate(t, `${esc(actor.name)} rated the fix ${"★".repeat(rating)}${"☆".repeat(5 - rating)}${comment.trim() ? `: "${esc(clip(comment, 200))}"` : ""}`);
}
