import { requireUser } from "@/lib/session";
import { assetTypes, findAssetByTag } from "@/lib/assets";
import { getLookups } from "@/lib/tickets";
import { RaiseForm } from "./raise-form";

export const metadata = { title: "Raise a job" };

export default async function Raise({ searchParams }: { searchParams: Promise<{ about?: string; title?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const [{ sites, categories, policies }, item] = await Promise.all([getLookups(), sp.about ? findAssetByTag(sp.about) : null]);
  const type = item?.typeId ? (await assetTypes(true)).find((t) => t.id === item.typeId) : null;
  const guess = categories.find((c) => c.name === (type?.isPrinter ? "Printer" : "Hardware"));
  const about = item
    ? { tag: item.tag, name: item.name, siteId: item.siteId, location: item.location, categoryId: guess?.id ?? null }
    : undefined;
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Raise a job</h1>
          <p className="sub">Tell IT what&apos;s wrong. Screenshots help us fix it faster.</p>
        </div>
      </div>
      <RaiseForm sites={sites} categories={categories} policies={policies} phone={u.phone ?? ""} about={about} title={sp.title?.slice(0, 160)} />
    </div>
  );
}
