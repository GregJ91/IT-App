import Link from "next/link";
import { Icon } from "@/components/icons";
import { TicketRow } from "@/components/ticket-row";
import { requireIT } from "@/lib/session";
import { dashboard } from "@/lib/tickets";

export const metadata = { title: "Dashboard" };

const greet = (d: Date) => {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(d));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
const dow = new Intl.DateTimeFormat("en-GB", { weekday: "narrow", timeZone: "UTC" });

export default async function Dashboard() {
  const u = await requireIT();
  const now = new Date();
  const d = await dashboard(u.id, now);
  const total = d.perDay.reduce((n, x) => n + x.n, 0);
  const max = Math.max(4, ...d.perDay.map((x) => x.n));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>
            {greet(now)}, {u.name.split(" ")[0]}
          </h1>
          <p className="sub">{today.format(now)}</p>
        </div>
        <div className="actions">
          <Link className="btn primary" href="/it/tickets">
            <Icon name="ticket" />
            Open queue
          </Link>
        </div>
      </div>
      <div className="grid cols-4">
        <Link className="panel kpi" href="/it/tickets">
          <span className="label">Open jobs</span>
          <span className="v">{d.open.length}</span>
          <span className="d">{d.unassigned.length} unassigned</span>
        </Link>
        <Link className={`panel kpi ${d.breaching.length ? "alert" : ""}`} href="/it/tickets">
          <span className="label">Past SLA</span>
          <span className="v">{d.breaching.length}</span>
          <span className="d">{d.breaching.length ? "Needs attention now" : "Nothing overdue"}</span>
        </Link>
        <Link className="panel kpi" href="/it/tickets?view=mine">
          <span className="label">Assigned to me</span>
          <span className="v">{d.mine.length}</span>
          <span className="d">Open jobs with your name on</span>
        </Link>
        <div className="panel kpi">
          <span className="label">Satisfaction</span>
          <span className="v">{d.rating.avg ? d.rating.avg.toFixed(1) : "–"}</span>
          <span className="d">{d.rating.n ? `Average of ${d.rating.n} rating${d.rating.n === 1 ? "" : "s"}, out of 5` : "No ratings yet"}</span>
        </div>
      </div>
      <div className="grid cols-main">
        <section className="panel">
          <div className="panel-head">
            <h2>Needs attention</h2>
            <Link href="/it/tickets" className="muted" style={{ fontSize: ".82rem" }}>
              All tickets
            </Link>
          </div>
          {d.attention.length ? (
            <div className="rows">
              {d.attention.map((t) => (
                <TicketRow key={t.id} t={t} href={`/it/tickets/${t.id}`} now={now} />
              ))}
            </div>
          ) : (
            <div className="empty">No open jobs. Nice.</div>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Jobs raised, last 14 days</h2>
            <span className="muted num" style={{ fontSize: ".82rem" }}>
              {total} total
            </span>
          </div>
          <div className="panel-body">
            <div className="bars">
              {d.perDay.map((x, i) => (
                <div key={x.day} className={i === d.perDay.length - 1 ? "today" : ""} style={{ height: `${(x.n / max) * 100}%` }} title={`${x.day}: ${x.n} job${x.n === 1 ? "" : "s"}`} />
              ))}
            </div>
            <div className="bar-axis">
              {d.perDay.map((x) => (
                <span key={x.day}>{dow.format(new Date(`${x.day}T12:00:00Z`))}</span>
              ))}
            </div>
            <p className="muted" style={{ fontSize: ".74rem", marginTop: 6 }}>
              Bar height: jobs per day, scale 0–{max}.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
