import Link from "next/link";
import { ukDate } from "@/components/asset-bits";
import { Icon } from "@/components/icons";
import { dayText, listChanges } from "@/lib/people";
import { requireIT } from "@/lib/session";

export const metadata = { title: "Starters & leavers" };

const VIEWS = [
  ["open", "Coming up"],
  ["starters", "Starters"],
  ["leavers", "Leavers"],
  ["done", "Done"],
] as const;
type View = (typeof VIEWS)[number][0];

export default async function People({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireIT();
  const sp = await searchParams;
  const view: View = VIEWS.some(([v]) => v === sp.view) ? (sp.view as View) : "open";
  const list = await listChanges(view);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Starters &amp; leavers</h1>
          <p className="sub">A checklist for everyone joining or leaving, with their kit handed out and collected through the inventory</p>
        </div>
        <div className="actions">
          <Link className="btn primary" href="/it/people/new?kind=starter">
            <Icon name="plus" />
            New starter
          </Link>
          <Link className="btn" href="/it/people/new?kind=leaver">
            <Icon name="plus" />
            New leaver
          </Link>
        </div>
      </div>
      <section className="panel">
        <div className="toolbar">
          <nav className="tabs" aria-label="Views">
            {VIEWS.map(([v, label]) => (
              <Link key={v} className="tab" href={v === "open" ? "/it/people" : `/it/people?view=${v}`} {...(v === view ? { "aria-current": "page" as const } : {})}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
        {list.length ? (
          <div className="rows">
            {list.map((c) => {
              const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
              const late = c.status === "open" && c.days < 0 && c.done < c.total;
              return (
                <Link key={c.id} href={`/it/people/${c.id}`} className="row people-row">
                  <span className={`chip ${c.kind === "starter" ? "s-ok" : "s-waiting"}`}>{c.kind === "starter" ? "Starter" : "Leaver"}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="title">{c.name}</span>
                    <span className="meta">{[c.jobTitle, c.siteName, c.manager && `Manager: ${c.manager}`].filter(Boolean).join(" · ") || " "}</span>
                  </span>
                  <span className="when">
                    <span className={late ? "t-late" : c.status === "open" && c.days <= 2 ? "t-soon" : ""}>
                      {c.status === "cancelled" ? "Cancelled" : c.status === "done" ? `Done · ${ukDate(c.date)}` : dayText(c.days, c.kind)}
                    </span>
                    <span className="meta">{ukDate(c.date)}</span>
                  </span>
                  <span className="progress-cell">
                    <span className="meta num">
                      {c.done} of {c.total} done
                    </span>
                    <span className="meter" aria-hidden="true">
                      <i className={late ? "late" : pct === 100 ? "" : "ok"} style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            <Icon name="people" />
            <p>{view === "done" ? "Nothing finished yet." : "No one starting or leaving."}</p>
            {view !== "done" && <p className="muted">Add a starter or leaver to get their checklist going.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
