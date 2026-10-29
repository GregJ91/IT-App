import { Shell } from "@/components/shell";
import { signOut } from "@/app/actions-auth";
import { hasPublishedArticles } from "@/lib/help";
import { isITRole, requireUser } from "@/lib/session";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const help = await hasPublishedArticles();
  const items = [
    { href: "/my", label: "My jobs", icon: "list" as const },
    { href: "/my/new", label: "Raise a job", icon: "plus" as const },
    ...(help ? [{ href: "/my/help", label: "Help", icon: "help" as const }] : []),
    ...(isITRole(u.role) ? [{ href: "/it", label: "IT dashboard", short: "IT", icon: "dash" as const }] : []),
  ];
  return (
    <Shell items={items} subtitle="IT support" me={{ name: u.name, detail: u.email }} signOut={signOut}>
      {children}
    </Shell>
  );
}
