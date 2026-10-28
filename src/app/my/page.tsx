import Link from "next/link";
import { Icon } from "@/components/icons";
import { StaffTicketRow } from "@/components/ticket-row";
import { requireUser } from "@/lib/session";
import { listMyTickets } from "@/lib/tickets";

export const metadata = { title: "My jobs" };

export default async function MyJobs() {
  const u = await requireUser();
  const list = await listMyTickets(u.id);
  const now = new Date();
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Hi {u.name.split(" ")[0]}</h1>
          <p className="sub">Your IT jobs and where they&apos;re up to</p>
        </div>
        <Link className="btn primary" href="/my/new">
          <Icon name="plus" />
          Raise a job
        </Link>
      </div>
      <section className="panel">
        {list.length ? (
          <div className="rows">
            {list.map((t) => (
              <StaffTicketRow key={t.id} t={t} now={now} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <p>You haven&apos;t raised any IT jobs yet.</p>
            <Link className="btn primary" href="/my/new">
              Raise your first job
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
