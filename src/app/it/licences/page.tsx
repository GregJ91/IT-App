import { money, ukDate } from "@/components/asset-bits";
import { listLicences } from "@/lib/licences";
import { daysBetween, ukToday } from "@/lib/reminders";
import { requireIT } from "@/lib/session";
import { archiveLicenceAction } from "./actions";
import { EditLicence, LicenceForm } from "./forms";

export const metadata = { title: "Licences" };

export default async function Licences() {
  await requireIT();
  const list = await listLicences();
  const today = ukToday();
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Licences</h1>
          <p className="sub">Software and subscriptions that renew. IT gets a reminder 14, 7 and 1 days before.</p>
        </div>
      </div>
      <section className="panel">
        {list.length ? (
          <div className="panel-body" style={{ paddingBlock: 4 }}>
            {list.map((l) => {
              const days = l.renewsOn ? daysBetween(today, l.renewsOn) : null;
              return (
                <div key={l.id} className="setting">
                  <span style={{ minWidth: 0 }}>
                    <strong>{l.name}</strong>
                    <br />
                    <span className="muted" style={{ fontSize: ".8rem" }}>
                      {[l.supplier, l.seats != null && `${l.seats} seats`, money(l.costPence)].filter(Boolean).join(" · ")}
                      {l.notes && ` · ${l.notes}`}
                    </span>
                  </span>
                  <span className="actions">
                    {l.renewsOn ? (
                      <span className={`chip ${days! < 0 ? "s-bad" : days! <= 30 ? "s-waiting" : "plain"}`}>
                        {days! < 0 ? `Was due ${ukDate(l.renewsOn)}` : `Renews ${ukDate(l.renewsOn)}`}
                      </span>
                    ) : (
                      <span className="muted">No renewal date</span>
                    )}
                    <EditLicence values={l} />
                    <form action={archiveLicenceAction}>
                      <input type="hidden" name="id" value={l.id} />
                      <button className="btn small danger">Remove</button>
                    </form>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="panel-body muted">No licences yet. Add Microsoft 365, antivirus, Sage, domain names and anything else that renews.</p>
        )}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Add a licence</h2>
        </div>
        <div className="panel-body">
          <LicenceForm />
        </div>
      </section>
    </div>
  );
}
