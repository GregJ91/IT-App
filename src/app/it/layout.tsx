import { Shell } from "@/components/shell";
import { signOut } from "@/app/actions-auth";
import { requireIT } from "@/lib/session";
import { countOpenTickets } from "@/lib/tickets";

export default async function ITLayout({ children }: { children: React.ReactNode }) {
  const u = await requireIT();
  const open = await countOpenTickets();
  const items = [
    { href: "/it", label: "Dashboard", short: "Home", icon: "dash" as const },
    { href: "/it/tickets", label: "Tickets", icon: "ticket" as const, count: open },
    { href: "/it/tickets/new", label: "New ticket", short: "New", icon: "plus" as const },
    ...(u.role === "admin" ? [{ href: "/it/settings", label: "Settings", icon: "cog" as const }] : []),
  ];
  return (
    <Shell items={items} subtitle="IT team" me={{ name: u.name, detail: u.role === "admin" ? "IT admin" : "IT tech" }} signOut={signOut}>
      {children}
    </Shell>
  );
}
