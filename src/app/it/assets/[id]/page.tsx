import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetStatusChip, money, ukDate } from "@/components/asset-bits";
import { CopyButton } from "@/components/copy-button";
import { Icon } from "@/components/icons";
import { Qr } from "@/components/qr";
import { StatusChip, when } from "@/components/ui";
import { getAsset, peopleOptions } from "@/lib/assets";
import { config } from "@/lib/config";
import { daysBetween, ukToday } from "@/lib/reminders";
import { requireIT } from "@/lib/session";
import { stockFitting } from "@/lib/stock";
import { getLookups } from "@/lib/tickets";
import { ticketRef } from "@/lib/tickets-shared";
import { deletePhotoAction } from "../actions";
import { CheckInForm, CheckOutForm, PhotoForm } from "./forms";

export const metadata = { title: "Item" };

function eventText(e: { type: string; data: Record<string, unknown>; actorName: string | null }) {
  const who = e.actorName ?? "Someone";
  const d = e.data;
  switch (e.type) {
    case "created":
      return `${who} added it to the inventory`;
    case "imported":
      return `${who} imported it from a spreadsheet`;
    case "edited":
      return `${who} changed ${(d.fields as string[]).join(", ").toLowerCase()}`;
    case "checked_out":
      return `${who} checked it out to ${d.to}${d.note ? `: “${d.note}”` : ""}`;
    case "checked_in":
      return `${who} checked it in${d.from ? ` from ${d.from}` : ""}${d.location ? ` to ${d.location}` : ""}${d.note ? `: “${d.note}”` : ""}`;
    case "photo":
      return `${who} added ${d.count === 1 ? "a photo" : `${d.count} photos`}`;
    case "ticket":
      return `${who} linked ${ticketRef(Number(d.ticketId))}: ${d.title}`;
    default:
      return `${who}: ${e.type}`;
  }
}

export default async function AssetPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ added?: string }> }) {
  await requireIT();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const d = await getAsset(Number(id));
  if (!d) notFound();
  const a = d.a;
  const [people, { sites }, toner] = await Promise.all([peopleOptions(), getLookups(), d.isPrinter ? stockFitting(a.model) : []]);
  const warrantyDays = a.warrantyUntil ? daysBetween(ukToday(), a.warrantyUntil) : null;
  const now = new Date();
  const facts: [string, React.ReactNode][] = [
    ["Type", d.typeName],
    ["Make / model", [a.make, a.model].filter(Boolean).join(" ")],
    ["Serial", a.serial && <span className="mono">{a.serial}</span>],
    ["Site", d.siteName],
    ["Location", a.location],
    [
      "IP address",
      a.ipAddress && (
        <>
          <span className="mono">{a.ipAddress}</span> <CopyButton text={a.ipAddress} />{" "}
          {d.isPrinter && (
            <a className="btn small" href={`http://${a.ipAddress}`} target="_blank" rel="noreferrer" style={{ padding: "1px 8px" }}>
              Open
            </a>
          )}
        </>
      ),
    ],
    ["MAC address", a.macAddress && <span className="mono">{a.macAddress}</span>],
    ["Bought", [ukDate(a.purchaseDate), money(a.purchaseCostPence), a.supplier && `from ${a.supplier}`].filter(Boolean).join(" · ")],
    [
      "Warranty until",
      a.warrantyUntil && (
        <>
          {ukDate(a.warrantyUntil)}{" "}
          {warrantyDays !== null && warrantyDays < 0 ? (
            <span className="chip s-closed">Ended</span>
          ) : warrantyDays !== null && warrantyDays <= 30 ? (
            <span className="chip s-waiting">{warrantyDays} days left</span>
          ) : null}
        </>
      ),
    ],
  ];

  return (
    <div className="page">
      <div>
        <Link className="btn" href="/it/assets">
          <Icon name="back" />
          Inventory
        </Link>
      </div>
      {sp.added && <p className="success">Added as {d.tag}. Print its label below, or add more photos.</p>}
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <p className="mono muted">{d.tag}</p>
          <h1>{a.name}</h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <AssetStatusChip status={a.status} />
            {d.typeName && <span className="chip plain">{d.typeName}</span>}
            {d.assignedTo && <span className="chip plain">With {d.assignedTo}</span>}
          </div>
        </div>
        <div className="actions">
          <Link className="btn" href={`/it/labels?assets=${a.id}`}>
            <Icon name="qr" />
            Print label
          </Link>
          <Link className="btn primary" href={`/it/assets/${a.id}/edit`}>
            Edit
          </Link>
        </div>
      </div>

      <div className="grid cols-main">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Photos</h2>
            </div>
            <div className="panel-body stack" style={{ gap: 12 }}>
              {d.photos.length > 0 && (
                <div className="thumbs">
                  {d.photos.map((p) => (
                    <figure key={p.id} className="photo">
                      <a className="thumb" href={`/api/asset-photos/${p.id}`} target="_blank" rel="noreferrer">
                        <img src={`/api/asset-photos/${p.id}`} alt={p.filename} loading="lazy" />
                      </a>
                      <form action={deletePhotoAction}>
                        <input type="hidden" name="photoId" value={p.id} />
                        <button className="btn small danger" aria-label={`Remove photo ${p.filename}`}>
                          Remove
                        </button>
                      </form>
                    </figure>
                  ))}
                </div>
              )}
              <PhotoForm id={a.id} />
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Details</h2>
            </div>
            <div className="panel-body stack" style={{ gap: 12 }}>
              <dl className="kv">
                {facts
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
              {a.notes && <p className="desc note">{a.notes}</p>}
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>IT jobs</h2>
              <span className="muted" style={{ fontSize: ".78rem" }}>Link a job from its ticket page</span>
            </div>
            {d.tickets.length ? (
              <div className="rows">
                {d.tickets.map((t) => (
                  <Link key={t.id} className="row staff" href={`/it/tickets/${t.id}`}>
                    <span className={`stripe bg-p${t.priority}`} />
                    <span className="rid mono muted">{ticketRef(t.id)}</span>
                    <span className="main" style={{ minWidth: 0 }}>
                      <div className="title">{t.title}</div>
                      <div className="meta">Raised {when(t.createdAt, now)}</div>
                    </span>
                    <span className="status">
                      <StatusChip status={t.status} />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="panel-body muted">No jobs linked to this item.</p>
            )}
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>History</h2>
            </div>
            <div className="panel-body list">
              {d.events.map((e) => (
                <div key={e.id}>
                  <span>{eventText(e)}</span>
                  <span className="muted">{when(e.createdAt, now)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Who has it</h2>
            </div>
            <div className="panel-body stack" style={{ gap: 12 }}>
              <p>{d.assignedTo ? <strong>{d.assignedTo}</strong> : <span className="muted">Nobody. It&apos;s {a.status === "retired" ? "retired" : "available"}.</span>}</p>
              {a.status !== "retired" && <CheckOutForm id={a.id} people={people} />}
              {d.assignedTo && <CheckInForm id={a.id} sites={sites} siteId={a.siteId} />}
            </div>
          </section>
          {d.isPrinter && (
            <section className="panel">
              <div className="panel-head">
                <h2>Toner and supplies</h2>
              </div>
              <div className="panel-body list">
                {toner.length ? (
                  toner.map((s) => (
                    <div key={s.id}>
                      <Link href={`/it/stock/${s.id}`}>{s.name}</Link>
                      <span className={s.minQuantity > 0 && s.quantity < s.minQuantity ? "t-late" : "muted"}>{s.quantity} in stock</span>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    No stock lists this model. Add &ldquo;{a.model || "the model"}&rdquo; to a stock item&apos;s <em>Fits</em> field to see it here.
                  </p>
                )}
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel-head">
              <h2>QR label</h2>
            </div>
            <div className="panel-body stack" style={{ gap: 10, alignItems: "center", textAlign: "center" }}>
              <div className="qr-box" style={{ width: 160 }}>
                <Qr value={`${config.appUrl}/a/${d.tag}`} label={`QR code for ${d.tag}`} />
              </div>
              <span className="mono">{d.tag}</span>
              <p className="muted" style={{ fontSize: ".8rem" }}>Scanning it with any phone camera opens this page.</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
