import { RaiseForm } from "@/app/my/new/raise-form";
import { requireIT } from "@/lib/session";
import { getLookups } from "@/lib/tickets";

export const metadata = { title: "New ticket" };

export default async function NewTicket() {
  const u = await requireIT();
  const { sites, categories, policies } = await getLookups();
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>New ticket</h1>
          <p className="sub">Log a job yourself, for example one that came in by phone. You&apos;ll be the requester.</p>
        </div>
      </div>
      <RaiseForm sites={sites} categories={categories} policies={policies} phone={u.phone ?? ""} />
    </div>
  );
}
