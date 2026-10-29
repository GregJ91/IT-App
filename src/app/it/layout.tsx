import { Shell, type NavItem } from "@/components/shell";
import { signOut } from "@/app/actions-auth";
import { requireIT } from "@/lib/session";
import { countOpenTickets } from "@/lib/tickets";

export default async function ITLayout({ children }: { children: React.ReactNode }) {
  const u = await requireIT();
  const open = await countOpenTickets();
  const items: NavItem[] = [
    { href: "/it", label: "Dashboard", short: "Home", icon: "dash" },
    { href: "/it/tickets", label: "Tickets", icon: "ticket", count: open },
    { href: "/it/tickets/new", label: "New ticket", icon: "plus", tab: false },
    { href: "/it/scan", label: "Scan", icon: "qr" },
    { href: "/it/assets", label: "Inventory", short: "Kit", icon: "box" },
    { href: "/it/stock", label: "Stock", icon: "layers" },
    { href: "/it/printers", label: "Printers", icon: "printer", tab: false },
    { href: "/it/network", label: "Network", icon: "net", tab: false },
    { href: "/it/licences", label: "Licences", icon: "doc", tab: false },
    { href: "/it/people", label: "Starters & leavers", icon: "people", tab: false },
    { href: "/it/help", label: "Help articles", icon: "help", tab: false },
    ...(u.role === "admin" ? [{ href: "/it/settings", label: "Settings", icon: "cog" as const, tab: false }] : []),
  ];
  return (
    <Shell items={items} subtitle="IT team" me={{ name: u.name, detail: u.role === "admin" ? "IT admin" : "IT tech" }} signOut={signOut}>
      {children}
    </Shell>
  );
}
