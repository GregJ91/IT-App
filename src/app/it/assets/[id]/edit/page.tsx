import { notFound } from "next/navigation";
import { assetTypes, getAsset } from "@/lib/assets";
import { requireIT } from "@/lib/session";
import { getLookups } from "@/lib/tickets";
import { AssetForm } from "../../asset-form";

export const metadata = { title: "Edit item" };

export default async function EditAsset({ params }: { params: Promise<{ id: string }> }) {
  await requireIT();
  const { id } = await params;
  const [d, types, { sites }] = await Promise.all([getAsset(Number(id)), assetTypes(true), getLookups()]);
  if (!d) notFound();
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <p className="mono muted">{d.tag}</p>
          <h1>Edit {d.name}</h1>
        </div>
      </div>
      <AssetForm types={types} sites={sites} values={d.a} />
    </div>
  );
}
