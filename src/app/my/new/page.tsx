import { requireUser } from "@/lib/session";
import { getLookups } from "@/lib/tickets";
import { RaiseForm } from "./raise-form";

export const metadata = { title: "Raise a job" };

export default async function Raise() {
  const u = await requireUser();
  const { sites, categories, policies } = await getLookups();
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Raise a job</h1>
          <p className="sub">Tell IT what&apos;s wrong. Screenshots help us fix it faster.</p>
        </div>
      </div>
      <RaiseForm sites={sites} categories={categories} policies={policies} phone={u.phone ?? ""} />
    </div>
  );
}
