"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { Avatar } from "./ui";

/** `tab: false` keeps an item out of the phone tab bar (it stays in the phone menu). */
export type NavItem = { href: string; label: string; short?: string; icon: IconName; count?: number; tab?: boolean };

// The longest nav link that the current path sits under is the current page.
function activeHref(path: string, items: NavItem[]) {
  // "/it" and "/my" are home pages: only exact matches count, so other pages don't light them up.
  const hits = items.filter((i) => path === i.href || (i.href !== "/it" && i.href !== "/my" && path.startsWith(i.href + "/")));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

// Forget cached pages on sign-out so the next person on a shared device can't see them offline.
function clearPageCache() {
  if (typeof caches === "undefined") return;
  caches.keys().then((keys) => keys.filter((k) => k.startsWith("pages-")).forEach((k) => caches.delete(k)));
}

export function Shell(props: {
  items: NavItem[];
  subtitle: string;
  me: { name: string; detail: string };
  signOut: () => Promise<void>;
  children: ReactNode;
}) {
  const path = usePathname();
  const active = activeHref(path, props.items);
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);
  const tabs = props.items.filter((i) => i.tab !== false);
  const more = props.items.length > tabs.length;
  const current = (href: string) => (href === active ? ({ "aria-current": "page" } as const) : {});
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand">
          <img className="logo-img" src="/brand/logo.png" alt="Gardeners Dream" />
          <div className="brand-sub">IT Hub · {props.subtitle}</div>
        </div>
        {props.items.map((i) => (
          <Link key={i.href} href={i.href} {...current(i.href)}>
            <Icon name={i.icon} />
            <span>{i.label}</span>
            {i.count ? <span className="count num">{i.count}</span> : null}
          </Link>
        ))}
        <div className="spacer" />
        <div className="me">
          <Avatar name={props.me.name} />
          <div className="who">
            <div style={{ fontWeight: 600 }}>{props.me.name}</div>
            <div className="brand-sub">{props.me.detail}</div>
          </div>
          <form action={props.signOut} onSubmit={clearPageCache}>
            <button className="signout" title="Sign out" aria-label="Sign out">
              <Icon name="out" />
            </button>
          </form>
        </div>
      </nav>
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <img className="logo-img" src="/brand/logo.png" alt="Gardeners Dream" />
          <div className="actions" style={{ gap: 4 }}>
            {more && (
              <button className="signout" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                <Icon name="menu" />
              </button>
            )}
            <form action={props.signOut} onSubmit={clearPageCache}>
              <button className="signout" aria-label="Sign out">
                <Icon name="out" />
              </button>
            </form>
          </div>
        </header>
        {menu && (
          <nav className="phone-menu" aria-label="All pages">
            {props.items.map((i) => (
              <Link key={i.href} href={i.href} {...current(i.href)}>
                <Icon name={i.icon} />
                <span>{i.label}</span>
              </Link>
            ))}
          </nav>
        )}
        <main id="main">{props.children}</main>
      </div>
      <nav className="tabbar" aria-label="Main">
        {tabs.map((i) => (
          <Link key={i.href} href={i.href} {...current(i.href)}>
            <Icon name={i.icon} />
            <span>{i.short ?? i.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
