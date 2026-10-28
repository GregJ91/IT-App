import { ASSET_STATUS_LABEL, isAssetStatus } from "@/lib/assets";
import { Icon, type IconName } from "./icons";

const CHIP: Record<string, string> = { in_use: "s-progress", spare: "s-ok", repair: "s-waiting", retired: "s-closed" };

export function AssetStatusChip({ status }: { status: string }) {
  return <span className={`chip ${CHIP[status] ?? ""}`}>{isAssetStatus(status) ? ASSET_STATUS_LABEL[status] : status}</span>;
}

/** A sensible icon for a type name. */
export function typeIcon(typeName: string | null | undefined): IconName {
  const t = (typeName ?? "").toLowerCase();
  if (t.includes("print") || t.includes("scan")) return "printer";
  if (t.includes("laptop") || t.includes("desktop") || t.includes("monitor") || t.includes("pc")) return "laptop";
  if (t.includes("label")) return "tag";
  return "box";
}

export function AssetThumb({ photoId, typeName, size = 44 }: { photoId: number | null; typeName: string | null; size?: number }) {
  return (
    <span className="asset-thumb" style={{ width: size, height: size }}>
      {photoId ? <img src={`/api/asset-photos/${photoId}`} alt="" loading="lazy" /> : <Icon name={typeIcon(typeName)} />}
    </span>
  );
}

export const money = (pence: number | null) =>
  pence == null ? null : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const ukDate = (iso: string | null) => (iso ? dateFmt.format(new Date(`${iso}T12:00:00Z`)) : null);
