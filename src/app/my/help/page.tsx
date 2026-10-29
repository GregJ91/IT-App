import Link from "next/link";
import { Icon } from "@/components/icons";
import { searchArticles } from "@/lib/help";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Help" };

export default async function Help({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = ((await searchParams).q ?? "").trim();
  const list = await searchArticles(q, { publishedOnly: true });
  // Group by category when browsing; keep the best match first when searching.
  const groups: [string, typeof list][] = [];
  for (const a of list) {
    const name = q ? "" : (a.categoryName ?? "Other");
    const g = groups.find(([n]) => n === name);
    if (g) g[1].push(a);
    else groups.push([name, [a]]);
  }
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Help</h1>
          <p className="sub">Quick fixes and how-tos from IT</p>
        </div>
      </div>
      <form action="/my/help" className="actions">
        <label className="search" htmlFor="sq" style={{ flex: 1 }}>
          <Icon name="search" />
          <input id="sq" name="q" defaultValue={q} placeholder="What do you need help with?" />
        </label>
        <button className="btn primary">Search</button>
      </form>
      {list.length ? (
        groups.map(([name, items]) => (
          <section key={name || "results"} className="panel">
            {name && (
              <div className="panel-head">
                <h2>{name}</h2>
              </div>
            )}
            <div className="rows">
              {items.map((a) => (
                <Link key={a.id} href={`/my/help/${a.slug}`} className="help-row">
                  <Icon name="doc" />
                  <span>
                    <strong>{a.title}</strong>
                    {a.summary && <span className="muted">{a.summary}</span>}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))
      ) : (
        <section className="panel empty">
          <Icon name="help" />
          <p>{q ? `Nothing matches "${q}".` : "No help articles yet."}</p>
        </section>
      )}
      <p className="muted" style={{ textAlign: "center" }}>
        Can&apos;t find it?{" "}
        <Link href="/my/new" style={{ fontWeight: 600 }}>
          Raise a job
        </Link>{" "}
        and IT will help.
      </p>
    </div>
  );
}
