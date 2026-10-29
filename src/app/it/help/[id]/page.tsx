import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { feedbackStats, getArticle } from "@/lib/help";
import { requireIT } from "@/lib/session";
import { getLookups } from "@/lib/tickets";
import { deleteArticleAction } from "../actions";
import { ArticleEditor } from "../editor";

export const metadata = { title: "Edit help article" };

export default async function EditArticle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireIT();
  const a = await getArticle({ id: Number((await params).id) });
  if (!a) notFound();
  const [{ categories }, stats] = await Promise.all([getLookups(), feedbackStats()]);
  const s = stats.get(a.id);
  return (
    <div className="page narrow">
      <div>
        <Link className="btn" href="/it/help">
          <Icon name="back" />
          Help articles
        </Link>
      </div>
      <div className="page-head">
        <div>
          <h1>{a.title}</h1>
          <p className="sub">
            {a.views} view{a.views === 1 ? "" : "s"}
            {s && ` · ${s.yes} found it helpful, ${s.no} didn't`}
            {s?.solved ? ` · ${s.solved} job${s.solved === 1 ? "" : "s"} not needed` : ""}
            {a.updatedBy && ` · last changed by ${a.updatedBy}`}
          </p>
        </div>
        <div className="actions">
          {a.published && (
            <Link className="btn" href={`/my/help/${a.slug}`}>
              View as staff
            </Link>
          )}
          <form action={deleteArticleAction}>
            <input type="hidden" name="id" value={a.id} />
            <button className="btn danger">Delete</button>
          </form>
        </div>
      </div>
      <ArticleEditor categories={categories} saved={(await searchParams).saved === "1"} v={{ id: a.id, title: a.title, summary: a.summary, body: a.body, categoryId: a.categoryId, published: a.published }} />
    </div>
  );
}
