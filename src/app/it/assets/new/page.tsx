import { assetTypes, nextTag } from "@/lib/assets";
import { requireIT } from "@/lib/session";
import { getLookups } from "@/lib/tickets";
import { AssetForm } from "../asset-form";

export const metadata = { title: "Add item" };

export default async function NewAsset({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireIT();
  const sp = await searchParams;
  const [types, { sites }, tag] = await Promise.all([assetTypes(), getLookups(), nextTag()]);
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Add an item</h1>
          <p className="sub">It gets a tag and a QR label so anyone in IT can scan it later.</p>
        </div>
      </div>
      <AssetForm types={types} sites={sites} nextTag={tag} values={{ typeId: Number(sp.type) || null }} />
    </div>
  );
}
