import Link from "next/link";
import { Icon } from "@/components/icons";
import { peopleOptions } from "@/lib/assets";
import { spareKit } from "@/lib/people";
import { requireIT } from "@/lib/session";
import { getLookups } from "@/lib/tickets";
import { ChangeForm } from "../forms";

export const metadata = { title: "New starter or leaver" };

export default async function NewChange({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireIT();
  const kind = (await searchParams).kind === "leaver" ? "leaver" : "starter";
  const [{ sites }, spares, people] = await Promise.all([getLookups(), kind === "starter" ? spareKit() : [], kind === "leaver" ? peopleOptions() : []]);
  return (
    <div className="page narrow">
      <div>
        <Link className="btn" href="/it/people">
          <Icon name="back" />
          Starters &amp; leavers
        </Link>
      </div>
      <div className="page-head">
        <div>
          <h1>{kind === "starter" ? "New starter" : "New leaver"}</h1>
          <p className="sub">
            {kind === "starter"
              ? "Their checklist starts from the standard starter list. Pick any spare kit they'll get, and it's checked out to them as you tick it off."
              : "Their checklist starts from the standard leaver list, plus every item of kit they have, so nothing is forgotten."}
          </p>
        </div>
        <nav className="tabs" aria-label="Starter or leaver">
          <Link className="tab" href="/it/people/new?kind=starter" {...(kind === "starter" ? { "aria-current": "page" as const } : {})}>
            Starter
          </Link>
          <Link className="tab" href="/it/people/new?kind=leaver" {...(kind === "leaver" ? { "aria-current": "page" as const } : {})}>
            Leaver
          </Link>
        </nav>
      </div>
      <ChangeForm kind={kind} sites={sites} spares={spares} people={people} />
    </div>
  );
}
