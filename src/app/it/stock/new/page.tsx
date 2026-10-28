import { requireIT } from "@/lib/session";
import { stockCategories } from "@/lib/stock";
import { getLookups } from "@/lib/tickets";
import { StockForm } from "../forms";

export const metadata = { title: "Add stock" };

export default async function NewStock() {
  await requireIT();
  const [{ sites }, categories] = await Promise.all([getLookups(), stockCategories()]);
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Add stock</h1>
          <p className="sub">Things you keep a count of rather than tag one by one.</p>
        </div>
      </div>
      <section className="panel panel-body">
        <StockForm sites={sites} categories={categories} />
      </section>
    </div>
  );
}
