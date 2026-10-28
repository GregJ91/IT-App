import type { Clock } from "@/lib/sla";
import { clockLabel } from "@/lib/sla";
import { STATUS_LABEL, isStatus } from "@/lib/tickets-shared";

export const initials = (name: string | null | undefined) =>
  (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function Avatar({ name }: { name: string | null | undefined }) {
  return (
    <span className="avatar" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  return <span className={`chip s-${status}`}>{isStatus(status) ? STATUS_LABEL[status] : status}</span>;
}

export function Prio({ p }: { p: number }) {
  return <span className={`prio p${p}`}>P{p}</span>;
}

export function ClockText({ c }: { c: Clock }) {
  return <span className={`sla ${c.state}`}>{clockLabel(c)}</span>;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** "08:12" today, "Yesterday", or "21 Oct". */
export function when(d: Date, now = new Date()) {
  const day = (x: Date) => dateFmt.format(x);
  if (day(d) === day(now)) return timeFmt.format(d);
  if (day(d) === day(new Date(now.getTime() - 864e5))) return "Yesterday";
  return day(d);
}

export const whenFull = (d: Date) => `${dateFmt.format(d)}, ${timeFmt.format(d)}`;
