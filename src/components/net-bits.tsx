import { Icon, type IconName } from "./icons";

export const KIND_LABEL: Record<string, string> = { gateway: "Gateway", switch: "Switch", ap: "Wi-Fi access point", other: "Device" };
export const KIND_ICON: Record<string, IconName> = { gateway: "globe", switch: "switch", ap: "wifi", other: "box" };

export function KindIcon({ kind }: { kind: string }) {
  return <Icon name={KIND_ICON[kind] ?? "box"} />;
}

export function WanChip({ status, stale }: { status: string; stale?: boolean }) {
  if (stale) return <span className="chip s-closed">Not updated</span>;
  if (status === "up") return <span className="chip s-ok">Internet up</span>;
  if (status === "down") return <span className="chip s-bad">Internet down</span>;
  return <span className="chip s-closed">Internet: no data</span>;
}

export function OnlineChip({ online, label }: { online: boolean; label?: [string, string] }) {
  const [on, off] = label ?? ["Online", "Offline"];
  return <span className={`chip ${online ? "s-ok" : "s-bad"}`}>{online ? on : off}</span>;
}

/** 41d 2h, 3h 10m, 12m */
export function uptime(sec: number | null) {
  if (sec == null) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

const ago = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
export function sinceText(d: Date | null, now = new Date()) {
  if (!d) return "—";
  const min = Math.round((d.getTime() - now.getTime()) / 60000);
  if (Math.abs(min) < 60) return ago.format(min, "minute");
  const h = Math.round(min / 60);
  if (Math.abs(h) < 48) return ago.format(h, "hour");
  return ago.format(Math.round(h / 24), "day");
}

/** 14 small bars: share of each day that something was up. */
export function UptimeBars({ days, label }: { days: { from: Date; upPct: number }[]; label: string }) {
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
  const avg = days.reduce((n, d) => n + d.upPct, 0) / Math.max(days.length, 1);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="uptime" role="img" aria-label={`${label}: ${avg.toFixed(1)}% up over ${days.length} days`}>
        {days.map((d) => (
          <span key={d.from.toISOString()} className={d.upPct >= 99.95 ? "up" : d.upPct >= 95 ? "some" : "down"} title={`${fmt.format(d.from)}: ${d.upPct.toFixed(1)}% up`} />
        ))}
      </div>
      <div className="uptime-axis">
        <span>{fmt.format(days[0].from)}</span>
        <span className="num">{avg.toFixed(avg >= 99.95 ? 0 : 1)}% up</span>
        <span>Today</span>
      </div>
    </div>
  );
}
