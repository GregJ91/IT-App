import Link from "next/link";
import { Icon } from "@/components/icons";
import { feedbackStats, searchArticles } from "@/lib/help";
import { requireIT } from "@/lib/session";

export const metadata = { title: "Help articles" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

export default async function HelpAdmin({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireIT();
  const q = ((await searchParams).q ?? "").trim();
  const [list, stats] = await Promise.all([searchArticles(q), feedbackStats()]);
  const solved = [...stats.values()].reduce((n, s) => n + s.solved, 0);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Help articles</h1>
          <p className="sub">
            How-to guides for staff. Published ones are suggested while people type a new job
            {solved > 0 && ` · ${solved} job${solved === 1 ? "" : "s"} not needed so far`}
          </p>
        </div>
        <Link className="btn primary" href="/it/help/new">
          <Icon name="plus" />
          New article
        </Link>
      </div>
      <section className="panel">
        <div className="toolbar">
          <form className="actions" style={{ flex: "1 1 320px" }} action="/it/help">
            <label className="search" htmlFor="hq">
              <Icon name="search" />
              <input id="hq" name="q" defaultValue={q} placeholder="Search articles" />
            </label>
          </form>
        </div>
        {list.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Status</th>
                  <th>Views</th>
                  <th>Helpful</th>
                  <th title="Times someone found the answer while raising a job, so didn't send it">Jobs saved</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => {
                  const s = stats.get(a.id);
                  return (
                    <tr key={a.id}>
                      <td style={{ minWidth: 220 }}>
                        <Link href={`/it/help/${a.id}`}>
                          <strong>{a.title}</strong>
                        </Link>
                        <div className="muted" style={{ fontSize: ".78rem" }}>
                          {[a.categoryName, a.summary].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td>{a.published ? <span className="chip s-ok">Published</span> : <span className="chip s-closed">Draft</span>}</td>
                      <td className="num">{a.views}</td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        {s && s.yes + s.no ? `${Math.round((s.yes / (s.yes + s.no)) * 100)}% of ${s.yes + s.no}` : "—"}
                      </td>
                      <td className="num">{s?.solved || "—"}</td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {dateFmt.format(a.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <Icon name="help" />
            <p>{q ? `Nothing matches "${q}".` : "No help articles yet."}</p>
            {!q && <p className="muted">Start with the questions IT gets asked most: Wi-Fi, printers, passwords, the VPN.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
