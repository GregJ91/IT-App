import Link from "next/link";
import { notFound } from "next/navigation";
import { changeTicket } from "@/app/actions-tickets";
import { AutoSelect } from "@/components/auto-select";
import { Composer } from "@/components/composer";
import { CopyButton } from "@/components/copy-button";
import { Icon } from "@/components/icons";
import { Screenshots, Thread } from "@/components/thread";
import { Prio, StatusChip, whenFull } from "@/components/ui";
import { requireIT } from "@/lib/session";
import { clockLabel, formatDuration, ticketClocks, type Clock } from "@/lib/sla";
import { assetOptions } from "@/lib/assets";
import { getLookups, getTicketForViewer } from "@/lib/tickets";
import { STATUSES, STATUS_LABEL, ticketRef } from "@/lib/tickets-shared";
import { TimeForm } from "./time-form";

export const metadata = { title: "Ticket" };

function Timer({ label, c }: { label: string; c: Clock }) {
  return (
    <div className="timer">
      <div className="top">
        <span>{label}</span>
        <span className={`num t-${c.state}`}>
          {c.state === "met" || c.state === "missed" ? `${c.state === "met" ? "Met" : "Missed"}, ${whenFull(c.doneAt!)}` : clockLabel(c)}
        </span>
      </div>
      <div className="meter">
        <i className={c.state} style={{ width: `${Math.max(c.used * 100, 3)}%` }} />
      </div>
      <span className="muted" style={{ fontSize: ".75rem" }}>
        {c.state === "paused" ? "Waiting on the requester. Restarts when they reply." : `Due ${whenFull(c.dueAt)}`}
      </span>
    </div>
  );
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireIT();
  const { id } = await params;
  const [d, lookups, kit] = await Promise.all([getTicketForViewer(Number(id), u), getLookups(), assetOptions()]);
  if (!d) notFound();
  const t = d.ticket;
  const clocks = ticketClocks(t);
  const policy = lookups.policies.find((p) => p.priority === t.priority);
  const names = new Map(lookups.itUsers.map((x) => [x.id, x.name]));
  // The chip shows where things stand now; a late first reply that's already happened shows in its own row.
  const states = [clocks.response.state, clocks.resolve.state];
  const [overall, overallLabel] = states.includes("late")
    ? ["s-bad", "Overdue"]
    : clocks.resolve.state === "paused"
      ? ["s-closed", "Paused"]
      : clocks.resolve.state === "met"
        ? ["s-ok", "Met"]
        : clocks.resolve.state === "missed"
          ? ["s-bad", "Missed"]
          : states.includes("soon")
            ? ["s-waiting", "Due soon"]
            : ["s-progress", "On track"];

  return (
    <div className="page">
      <div>
        <Link className="btn" href="/it/tickets">
          <Icon name="back" />
          Tickets
        </Link>
      </div>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <p className="mono muted">
            {ticketRef(t.id)}
            {d.category && ` · ${d.category.name}`}
          </p>
          <h1>{t.title}</h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <Prio p={t.priority} /> <StatusChip status={t.status} />
            {d.site && <span className="chip plain">{d.site.name}</span>}
          </div>
        </div>
        <div className="actions">
          <form action={changeTicket} className="actions">
            <input type="hidden" name="ticketId" value={t.id} />
            <AutoSelect name="status" defaultValue={t.status} label="Status" className="filter">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </AutoSelect>
          </form>
          {!["resolved", "closed"].includes(t.status) && (
            <form action={changeTicket}>
              <input type="hidden" name="ticketId" value={t.id} />
              <input type="hidden" name="status" value="resolved" />
              <button className="btn primary">Resolve</button>
            </form>
          )}
        </div>
      </div>
      <div className="grid cols-main">
        <div className="stack">
          <section className="panel">
            <div className="panel-body stack" style={{ gap: 14 }}>
              <p className="desc">{t.description}</p>
              <Screenshots detail={d} />
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Activity</h2>
              <span className="muted" style={{ fontSize: ".8rem" }}>
                Logged: <span className="num">{d.minutesLogged ? formatDuration(d.minutesLogged * 60000) : "0m"}</span>
              </span>
            </div>
            <div className="panel-body stack">
              <Thread detail={d} it assigneeNames={names} />
              <Composer ticketId={t.id} it />
            </div>
          </section>
        </div>
        <aside className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>SLA</h2>
              <span className={`chip ${overall}`}>{overallLabel}</span>
            </div>
            <div className="panel-body stack" style={{ gap: 14 }}>
              <Timer label="First response" c={clocks.response} />
              <Timer label={`Resolve${policy ? ` within ${formatDuration(policy.resolveMinutes * 60000)}` : ""}`} c={clocks.resolve} />
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Details</h2>
            </div>
            <div className="panel-body">
              <form action={changeTicket}>
                <input type="hidden" name="ticketId" value={t.id} />
                <dl className="kv">
                  <dt>Requester</dt>
                  <dd>
                    {d.requester.name}
                    <div className="muted" style={{ fontSize: ".78rem" }}>{d.requester.email}</div>
                  </dd>
                  <dt>Contact</dt>
                  <dd>
                    {t.contactPhone ? (
                      <>
                        <span className="mono">{t.contactPhone}</span> <CopyButton text={t.contactPhone} />
                      </>
                    ) : (
                      <span className="muted">Not given</span>
                    )}
                  </dd>
                  <dt>Where</dt>
                  <dd>{t.location || <span className="muted">Not given</span>}</dd>
                  <dt>Assigned</dt>
                  <dd>
                    <AutoSelect name="assigneeId" defaultValue={t.assigneeId ?? ""} label="Assigned to">
                      <option value="">Unassigned</option>
                      {lookups.itUsers.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </AutoSelect>
                  </dd>
                  <dt>Priority</dt>
                  <dd>
                    <AutoSelect name="priority" defaultValue={t.priority} label="Priority">
                      {lookups.policies.map((p) => (
                        <option key={p.priority} value={p.priority}>
                          P{p.priority} {p.label}
                        </option>
                      ))}
                    </AutoSelect>
                  </dd>
                  <dt>Category</dt>
                  <dd>
                    <AutoSelect name="categoryId" defaultValue={t.categoryId ?? ""} label="Category">
                      <option value="">None</option>
                      {lookups.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </AutoSelect>
                  </dd>
                  <dt>Site</dt>
                  <dd>
                    <AutoSelect name="siteId" defaultValue={t.siteId ?? ""} label="Site">
                      <option value="">None</option>
                      {lookups.sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </AutoSelect>
                  </dd>
                  <dt>Item</dt>
                  <dd>
                    <AutoSelect name="assetId" defaultValue={t.assetId ?? ""} label="Linked item">
                      <option value="">None</option>
                      {kit.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.tag} · {x.name}
                        </option>
                      ))}
                    </AutoSelect>
                    {t.assetId && (
                      <Link href={`/it/assets/${t.assetId}`} style={{ fontSize: ".8rem" }}>
                        Open item
                      </Link>
                    )}
                  </dd>
                  <dt>Raised</dt>
                  <dd>{whenFull(t.createdAt)}</dd>
                  {t.satisfaction && (
                    <>
                      <dt>Rating</dt>
                      <dd>
                        {"★".repeat(t.satisfaction)}
                        <span className="muted">{"★".repeat(5 - t.satisfaction)}</span>
                        {t.satisfactionComment && <div className="muted" style={{ fontSize: ".8rem" }}>“{t.satisfactionComment}”</div>}
                      </dd>
                    </>
                  )}
                </dl>
                <noscript>
                  <button className="btn small" style={{ marginTop: 10 }}>Save</button>
                </noscript>
              </form>
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Time</h2>
            </div>
            <div className="panel-body stack" style={{ gap: 10 }}>
              {d.time.length > 0 && (
                <div className="list">
                  {d.time.map((e) => (
                    <div key={e.id}>
                      <span>
                        {e.userName} · {e.note || "Work"}
                      </span>
                      <span className="num muted">{formatDuration(e.minutes * 60000)}</span>
                    </div>
                  ))}
                </div>
              )}
              <TimeForm ticketId={t.id} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
