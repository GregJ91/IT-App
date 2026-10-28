import Link from "next/link";
import { Icon } from "@/components/icons";
import { TicketRow } from "@/components/ticket-row";
import { requireIT } from "@/lib/session";
import { getLookups, listTickets, type TicketView } from "@/lib/tickets";

export const metadata = { title: "Tickets" };

const VIEWS: [TicketView, string][] = [
  ["open", "Open"],
  ["mine", "Mine"],
  ["unassigned", "Unassigned"],
  ["done", "Resolved"],
  ["all", "All"],
];

export default async function Tickets({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireIT();
  const sp = await searchParams;
  const view = (VIEWS.find(([v]) => v === sp.view)?.[0] ?? "open") as TicketView;
  const siteId = Number(sp.site) || null;
  const priority = Number(sp.p) || null;
  const [list, { sites }] = await Promise.all([listTickets({ view, userId: u.id, siteId, priority, q: sp.q }), getLookups()]);
  const now = new Date();
  const qs = (v: TicketView) => {
    const p = new URLSearchParams();
    if (v !== "open") p.set("view", v);
    if (siteId) p.set("site", String(siteId));
    if (priority) p.set("p", String(priority));
    if (sp.q) p.set("q", sp.q);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tickets</h1>
          <p className="sub">Open jobs are sorted by priority, then by what&apos;s due first</p>
        </div>
        <Link className="btn primary" href="/it/tickets/new">
          <Icon name="plus" />
          New ticket
        </Link>
      </div>
      <section className="panel">
        <div className="toolbar">
          <nav className="tabs" aria-label="Views">
            {VIEWS.map(([v, label]) => (
              <Link key={v} className="tab" href={`/it/tickets${qs(v)}`} {...(v === view ? { "aria-current": "page" as const } : {})}>
                {label}
              </Link>
            ))}
          </nav>
          <form className="actions" style={{ flex: "1 1 320px" }} action="/it/tickets">
            {view !== "open" && <input type="hidden" name="view" value={view} />}
            <label className="search" htmlFor="tq">
              <Icon name="search" />
              <input id="tq" name="q" defaultValue={sp.q} placeholder="Search title, person, place or IT-number" />
            </label>
            <select className="filter" name="site" defaultValue={siteId ?? ""} aria-label="Site">
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select className="filter" name="p" defaultValue={priority ?? ""} aria-label="Priority">
              <option value="">Any priority</option>
              {[1, 2, 3, 4].map((p) => (
                <option key={p} value={p}>
                  P{p}
                </option>
              ))}
            </select>
            <button className="btn">Filter</button>
          </form>
        </div>
        {list.length ? (
          <div className="rows">
            {list.map((t) => (
              <TicketRow key={t.id} t={t} href={`/it/tickets/${t.id}`} now={now} />
            ))}
          </div>
        ) : (
          <div className="empty">No tickets match this view.</div>
        )}
      </section>
    </div>
  );
}
