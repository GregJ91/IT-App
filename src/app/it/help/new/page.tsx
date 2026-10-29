import Link from "next/link";
import { Icon } from "@/components/icons";
import { requireIT } from "@/lib/session";
import { getLookups } from "@/lib/tickets";
import { ArticleEditor } from "../editor";

export const metadata = { title: "New help article" };

export default async function NewArticle() {
  await requireIT();
  const { categories } = await getLookups();
  return (
    <div className="page narrow">
      <div>
        <Link className="btn" href="/it/help">
          <Icon name="back" />
          Help articles
        </Link>
      </div>
      <div className="page-head">
        <h1>New help article</h1>
      </div>
      <ArticleEditor categories={categories} />
    </div>
  );
}
