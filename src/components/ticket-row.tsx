import Link from "next/link";
import { headlineClock } from "@/lib/sla";
import type { TicketListItem } from "@/lib/tickets";
import { ticketRef } from "@/lib/tickets-shared";
import { Avatar, ClockText, Prio, StatusChip, when } from "./ui";

export function TicketRow({ t, href, now }: { t: TicketListItem; href: string; now: Date }) {
  const open = !["resolved", "closed"].includes(t.status);
  const c = headlineClock(t, now);
  const where = [t.siteName, t.location].filter(Boolean).join(" · ");
  return (
    <Link className="row" href={href}>
      <span className={`stripe bg-p${t.priority}`} />
      <span className="rid mono muted">{ticketRef(t.id)}</span>
      <span className="main" style={{ minWidth: 0 }}>
        <div className="title">{t.title}</div>
        <div className="meta">
          <Prio p={t.priority} /> &nbsp;{t.requesterName}
          {where && ` · ${where}`}
          {t.attachments > 0 && ` · ${t.attachments} image${t.attachments > 1 ? "s" : ""}`}
        </div>
      </span>
      <span className="status">
        <StatusChip status={t.status} />
      </span>
      <span className="who">
        {t.assigneeName ? (
          <>
            <Avatar name={t.assigneeName} />
            {t.assigneeName}
          </>
        ) : (
          <span className="muted">Unassigned</span>
        )}
      </span>
      {open ? <ClockText c={c} /> : <span className="sla muted">{when(t.updatedAt, now)}</span>}
    </Link>
  );
}

export function StaffTicketRow({ t, now }: { t: TicketListItem; now: Date }) {
  return (
    <Link className="row staff" href={`/my/${t.id}`}>
      <span className={`stripe bg-p${t.priority}`} />
      <span className="rid mono muted">{ticketRef(t.id)}</span>
      <span className="main" style={{ minWidth: 0 }}>
        <div className="title">{t.title}</div>
        <div className="meta">
          Raised {when(t.createdAt, now)}
          {t.location && ` · ${t.location}`}
        </div>
      </span>
      <span className="status">
        <StatusChip status={t.status} />
      </span>
    </Link>
  );
}
