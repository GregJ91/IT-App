import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Qr } from "@/components/qr";
import { when } from "@/components/ui";
import { config } from "@/lib/config";
import { requireIT } from "@/lib/session";
import { getStockItem, isLow, stockCategories } from "@/lib/stock";
import { getLookups } from "@/lib/tickets";
import { ticketRef } from "@/lib/tickets-shared";
import { archiveStockAction } from "../actions";
import { MoveForm, StockForm } from "../forms";

export const metadata = { title: "Stock item" };

const REASON: Record<string, string> = { taken: "took", received: "added", counted: "counted the shelf:" };

export default async function StockItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireIT();
  const { id } = await params;
  const [d, { sites }, categories] = await Promise.all([getStockItem(Number(id)), getLookups(), stockCategories()]);
  if (!d) notFound();
  const i = d.item;
  const now = new Date();
  return (
    <div className="page">
      <div>
        <Link className="btn" href="/it/stock">
          <Icon name="back" />
          Stock
        </Link>
      </div>
      <div className="page-head">
        <div>
          <p className="mono muted">{i.code}</p>
          <h1>{i.name}</h1>
          <p className="sub">{[i.category, [d.site?.name, i.location].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="grid cols-main">
        <div className="stack">
          <section className="panel">
            <div className="panel-body stack" style={{ gap: 14 }}>
              <div className="actions" style={{ justifyContent: "space-between" }}>
                <div className="kpi" style={{ padding: 0 }}>
                  <span className="label">In stock</span>
                  <span className={`v ${isLow(i) ? "t-late" : ""}`}>{i.quantity}</span>
                  <span className="d">{i.minQuantity ? `Alert below ${i.minQuantity}` : "No low-stock alert"}</span>
                </div>
                {isLow(i) && <span className="chip s-bad">Running low{i.supplier ? `: reorder from ${i.supplier}` : ""}</span>}
              </div>
              <MoveForm id={i.id} quantity={i.quantity} />
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>History</h2>
            </div>
            <div className="panel-body list">
              {d.moves.length ? (
                d.moves.map((m) => (
                  <div key={m.id}>
                    <span>
                      {m.userName ?? "Someone"} {REASON[m.reason] ?? m.reason} {m.reason === "counted" ? m.quantityAfter : Math.abs(m.delta)}
                      {m.ticketId && (
                        <>
                          {" "}
                          for <Link href={`/it/tickets/${m.ticketId}`}>{ticketRef(m.ticketId)}</Link>
                        </>
                      )}
                      {m.note && <span className="muted"> · {m.note}</span>}
                    </span>
                    <span className="muted num">
                      {m.quantityAfter} left · {when(m.createdAt, now)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted">Nothing taken or added yet.</p>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Details</h2>
            </div>
            <div className="panel-body">
              <StockForm sites={sites} categories={categories} values={i} />
            </div>
          </section>
        </div>
        <aside className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Shelf label</h2>
            </div>
            <div className="panel-body stack" style={{ gap: 10, alignItems: "center", textAlign: "center" }}>
              <div className="qr-box" style={{ width: 160 }}>
                <Qr value={`${config.appUrl}/s/${i.code}`} label={`QR code for ${i.code}`} />
              </div>
              <span className="mono">{i.code}</span>
              <p className="muted" style={{ fontSize: ".8rem" }}>Stick it on the shelf. Scanning it opens this page with the Take one button.</p>
              <Link className="btn" href={`/it/labels?stock=${i.id}`}>
                Print label
              </Link>
            </div>
          </section>
          <form action={archiveStockAction}>
            <input type="hidden" name="id" value={i.id} />
            <button className="btn danger">Remove from stock list</button>
          </form>
        </aside>
      </div>
    </div>
  );
}
