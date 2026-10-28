import Link from "next/link";
import { notFound } from "next/navigation";
import { Composer } from "@/components/composer";
import { Icon } from "@/components/icons";
import { Screenshots, Thread } from "@/components/thread";
import { StatusChip, whenFull } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { getTicketForViewer } from "@/lib/tickets";
import { ticketRef } from "@/lib/tickets-shared";
import { RateForm } from "./rate-form";

export const metadata = { title: "Job" };

export default async function StaffJob(props: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const u = await requireUser();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const d = await getTicketForViewer(Number(id), u);
  if (!d) notFound();
  const t = d.ticket;
  const order = ["new", "progress", "waiting", "resolved", "closed"];
  const at = order.indexOf(t.status);
  const steps = [
    { label: "Raised", detail: whenFull(t.createdAt), state: "done" },
    { label: d.assignee ? `Assigned to ${d.assignee.name}` : "Waiting for someone in IT", detail: "", state: d.assignee ? "done" : at === 0 ? "now" : "done" },
    { label: t.status === "waiting" ? "Waiting on you" : "In progress", detail: t.status === "waiting" ? "IT needs something from you. Reply below." : "", state: at >= 3 ? "done" : at >= 1 ? "now" : "" },
    { label: "Resolved", detail: t.resolvedAt ? whenFull(t.resolvedAt) : "", state: at >= 3 ? (at === 3 ? "now" : "done") : "" },
    { label: "Closed", detail: "", state: at === 4 ? "done" : "" },
  ];
  const names = new Map(d.assignee ? [[d.assignee.id, d.assignee.name]] : []);
  return (
    <div className="page narrow">
      <div>
        <Link className="btn" href="/my">
          <Icon name="back" />
          My jobs
        </Link>
      </div>
      {sp.new && <p className="success">Sent. IT has been told and you&apos;ll get an email when there&apos;s an update.</p>}
      <div>
        <p className="mono muted">{ticketRef(t.id)}</p>
        <h1>{t.title}</h1>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <StatusChip status={t.status} />
          {d.site && <span className="chip plain">{d.site.name}</span>}
          {t.location && <span className="chip plain">{t.location}</span>}
        </div>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>Progress</h2>
        </div>
        <div className="panel-body steps">
          {steps.map((s) => (
            <div key={s.label} className={`step ${s.state}`}>
              <span className="dot" />
              <div>
                <div style={{ fontWeight: 600 }}>{s.label}</div>
                {s.detail && <div className="muted" style={{ fontSize: ".82rem" }}>{s.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>
      {["resolved", "closed"].includes(t.status) && (
        <section className="panel">
          <div className="panel-head">
            <h2>How did we do?</h2>
          </div>
          <div className="panel-body">
            {t.satisfaction ? (
              <p>
                You rated this {t.satisfaction} out of 5. Thanks.
              </p>
            ) : (
              <RateForm ticketId={t.id} />
            )}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <h2>Details</h2>
        </div>
        <div className="panel-body stack" style={{ gap: 12 }}>
          <p className="desc">{t.description}</p>
          <Screenshots detail={d} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Messages</h2>
        </div>
        <div className="panel-body stack">
          <Thread detail={d} it={false} assigneeNames={names} />
          {t.status !== "closed" && <Composer ticketId={t.id} it={false} />}
        </div>
      </section>
    </div>
  );
}
