import Link from "next/link";
import { notFound } from "next/navigation";
import { ukDate } from "@/components/asset-bits";
import { Icon } from "@/components/icons";
import { dayText, getChange, spareKit } from "@/lib/people";
import { requireIT } from "@/lib/session";
import { getLookups } from "@/lib/tickets";
import { setStatusAction } from "../actions";
import { AddTask, EditChange, TaskRow } from "../forms";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const c = await getChange(Number((await params).id));
  return { title: c ? c.name : "Not found" };
}

const stamp = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Change({ params }: { params: Promise<{ id: string }> }) {
  await requireIT();
  const c = await getChange(Number((await params).id));
  if (!c) notFound();
  const kind = c.kind as "starter" | "leaver";
  const [{ sites }, spares] = await Promise.all([getLookups(), kind === "starter" ? spareKit() : []]);
  const tasks = c.tasks.filter((t) => t.kind === "task");
  const kit = c.tasks.filter((t) => t.kind !== "task");
  const done = c.tasks.filter((t) => t.doneAt).length;
  const pct = c.tasks.length ? Math.round((done / c.tasks.length) * 100) : 0;
  const cancelled = c.status === "cancelled";
  const late = c.status === "open" && c.days < 0;

  const row = (t: (typeof c.tasks)[number]) => (
    <TaskRow
      key={t.id}
      changeId={c.id}
      id={t.id}
      done={!!t.doneAt}
      title={t.title}
      href={t.assetId ? `/it/assets/${t.assetId}` : undefined}
      sub={t.doneAt ? `${t.doneBy ?? "Someone"} · ${stamp.format(t.doneAt)}` : t.kind === "kit_out" ? "Ticking checks it out to them" : t.kind === "kit_back" ? "Ticking checks it back in as spare" : ""}
      canRemove={!t.doneAt || t.kind === "task"}
      disabled={cancelled}
    />
  );

  return (
    <div className="page">
      <div>
        <Link className="btn" href="/it/people">
          <Icon name="back" />
          Starters &amp; leavers
        </Link>
      </div>
      <div className="page-head">
        <div>
          <p className="muted" style={{ fontSize: ".85rem" }}>
            {kind === "starter" ? "Starter" : "Leaver"}
          </p>
          <h1>{c.name}</h1>
          <p className="sub">
            {[c.jobTitle, c.siteName, c.manager && `Manager: ${c.manager}`, c.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="actions">
          <span className={`chip ${cancelled ? "s-closed" : c.status === "done" ? "s-ok" : late ? "s-bad" : c.days <= 2 ? "s-waiting" : "plain"}`}>
            {cancelled ? "Cancelled" : c.status === "done" ? "All done" : dayText(c.days, kind)}
          </span>
          <EditChange kind={kind} sites={sites} v={{ id: c.id, name: c.name, email: c.email, jobTitle: c.jobTitle, siteId: c.siteId, manager: c.manager, date: c.date, notes: c.notes }} />
          <form action={setStatusAction}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="status" value={cancelled ? "open" : "cancelled"} />
            <button className={`btn${cancelled ? "" : " danger"}`}>{cancelled ? "Reopen" : "Cancel"}</button>
          </form>
        </div>
      </div>

      <div className="grid cols-main">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Checklist</h2>
              <span className="muted num" style={{ fontSize: ".82rem" }}>
                {done} of {c.tasks.length} done
              </span>
            </div>
            <div className="panel-body" style={{ paddingBottom: 12 }}>
              <div className="meter" aria-label={`${pct}% done`}>
                <i className={late ? "late" : pct === 100 ? "" : "ok"} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="checklist">{tasks.map(row)}</div>
            {!cancelled && <AddTask changeId={c.id} />}
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>{kind === "starter" ? "Kit to hand out" : "Kit to collect"}</h2>
              <span className="muted" style={{ fontSize: ".78rem" }}>
                Updates the inventory as you tick
              </span>
            </div>
            {kit.length ? <div className="checklist">{kit.map(row)}</div> : <p className="panel-body muted">{kind === "starter" ? "No kit added yet." : "They don't have any kit in the inventory."}</p>}
            {!cancelled && (kind === "starter" ? spares.length > 0 : c.alsoHolding.length > 0) && (
              <AddTask changeId={c.id} kit={kind === "starter" ? spares : c.alsoHolding} />
            )}
          </section>
        </div>
        <aside className="stack">
          {c.alsoHolding.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2>Still has</h2>
              </div>
              <div className="panel-body list">
                {c.alsoHolding.map((a) => (
                  <div key={a.id}>
                    <Link href={`/it/assets/${a.id}`}>
                      <span className="mono muted">{a.tag}</span> {a.name}
                    </Link>
                  </div>
                ))}
                <p className="muted" style={{ fontSize: ".8rem" }}>
                  Assigned to them in the inventory but not on the list. Add it under Kit to collect.
                </p>
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel-head">
              <h2>Details</h2>
            </div>
            <div className="panel-body list">
              <div>
                <span className="muted">{kind === "starter" ? "First day" : "Last day"}</span>
                <span>{ukDate(c.date)}</span>
              </div>
              <div>
                <span className="muted">IT Hub account</span>
                <span>{c.userId ? "Yes" : c.email ? "Not yet" : "—"}</span>
              </div>
              <div>
                <span className="muted">Added by</span>
                <span>{c.createdBy ?? "—"}</span>
              </div>
              {c.doneAt && (
                <div>
                  <span className="muted">Finished</span>
                  <span>{stamp.format(c.doneAt)}</span>
                </div>
              )}
              {c.notes && <p style={{ whiteSpace: "pre-wrap" }}>{c.notes}</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
