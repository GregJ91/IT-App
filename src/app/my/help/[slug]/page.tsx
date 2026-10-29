import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Markdown } from "@/components/markdown";
import { countView, getArticle, myFeedback } from "@/lib/help";
import { isITRole, requireUser } from "@/lib/session";
import { Feedback } from "./feedback";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getArticle({ slug: (await params).slug });
  return { title: a?.published ? a.title : "Help" };
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

export default async function Article({ params }: { params: Promise<{ slug: string }> }) {
  const u = await requireUser();
  const a = await getArticle({ slug: (await params).slug });
  // Drafts are only visible to IT, so they can check them.
  if (!a || (!a.published && !isITRole(u.role))) notFound();
  if (a.published && !isITRole(u.role)) await countView(a.id);
  const mine = await myFeedback(u.id, a.id);
  return (
    <div className="page narrow">
      <div>
        <Link className="btn" href="/my/help">
          <Icon name="back" />
          Help
        </Link>
      </div>
      <article className="panel panel-body">
        {!a.published && <p className="note">Draft: only the IT team can see this.</p>}
        <p className="muted" style={{ fontSize: ".82rem" }}>
          {[a.categoryName, `Updated ${dateFmt.format(a.updatedAt)}`].filter(Boolean).join(" · ")}
        </p>
        <h1 style={{ margin: "4px 0 6px" }}>{a.title}</h1>
        {a.summary && <p className="sub" style={{ marginBottom: 12 }}>{a.summary}</p>}
        <Markdown source={a.body} />
      </article>
      <Feedback articleId={a.id} answered={mine ? (mine.helpful ? "yes" : "no") : null} title={a.title} />
    </div>
  );
}
