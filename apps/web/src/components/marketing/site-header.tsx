"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import {
  ArrowRight,
  Briefcase,
  ChevronDown,
  FileCheck,
  Handshake,
  Layers,
  Route,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { PRODUCT_LINKS, SOLUTION_LINKS, SignetWordmark, type SiteNavLink } from "@/components/marketing/site-chrome";
import { cn } from "@/lib/utils";

type MenuKey = "product" | "solutions";

const MENUS: Record<MenuKey, { label: string; links: SiteNavLink[]; icons: LucideIcon[]; match: string[]; blurb: string }> = {
  product: {
    label: "Product",
    links: PRODUCT_LINKS,
    icons: [FileCheck, Route, ShieldCheck, Layers],
    match: ["/features", "/security"],
    blurb: "Prepare PDFs, route them to the right people, and keep the record.",
  },
  solutions: {
    label: "Solutions",
    links: SOLUTION_LINKS,
    icons: [Briefcase, Users, Scale, Handshake],
    match: ["/solutions"],
    blurb: "One signing workflow for every team that sends agreements.",
  },
};

const PLAIN_LINKS = [
  { label: "Pricing", href: "/pricing", match: ["/pricing", "/checkout"] },
  { label: "Contact", href: "/contact", match: ["/contact"] },
];

function isActive(pathname: string, match: string[]) {
  return match.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function MenuPanel({ menu, onNavigate }: { menu: MenuKey; onNavigate: () => void }) {
  const { label, links, icons, blurb } = MENUS[menu];
  return (
    <div className="grid w-[44rem] grid-cols-[13rem_1fr] overflow-hidden rounded-3xl bg-card text-card-foreground shadow-2xl shadow-(--site-ink)/25 ring-1 ring-border">
      <div className="relative flex flex-col justify-between overflow-hidden bg-(--site-ink) p-5 text-white">
        <div className="pointer-events-none absolute -end-10 -top-10 size-40 rounded-full bg-(--site-accent)/40 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wider text-(--site-accent-soft)">{label}</p>
          <p className="mt-3 text-sm leading-6 text-white/75">{blurb}</p>
        </div>
        <Link
          href="/signup"
          onClick={onNavigate}
          className="group relative mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-white"
        >
          Start free
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-1 p-3">
        {links.map((link, index) => {
          const Icon = icons[index];
          return (
            <li key={link.href}>
              <Link href={link.href} onClick={onNavigate} className="group flex h-full gap-3 rounded-2xl p-3 transition hover:bg-(--site-tint)">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--site-tint) text-(--site-accent) ring-1 ring-(--site-accent)/10 transition group-hover:bg-(--site-accent) group-hover:text-white">
                  <Icon className="size-[18px]" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{link.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{link.description}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Floating pill navigation. Over a dark hero it is translucent; once the page
 * scrolls (or when `solid` is set for pages without a dark hero) it turns into frosted glass.
 */
export function SiteHeader({ solid = false }: { solid?: boolean }) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const glass = solid || scrolled;

  const closeAll = () => {
    setOpenMenu(null);
    setMobileOpen(false);
  };

  const openWithHover = (menu: MenuKey) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenMenu(menu);
  };

  const closeWithDelay = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenMenu(null), 140);
  };

  const closeOnBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenMenu(null);
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!openMenu && !mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMenu, mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 64rem)");
    const onChange = () => desktop.matches && setMobileOpen(false);
    desktop.addEventListener("change", onChange);
    return () => {
      document.body.style.overflow = previous;
      desktop.removeEventListener("change", onChange);
    };
  }, [mobileOpen]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const navItemClass = (active: boolean) =>
    cn(
      "relative inline-flex h-9 items-center gap-1 rounded-full px-4 text-sm font-medium transition-colors",
      glass
        ? active
          ? "bg-(--site-accent)/10 text-(--site-accent)"
          : "text-(--site-text)/70 hover:bg-(--site-text)/5 hover:text-(--site-text)"
        : active
          ? "bg-white/15 text-white"
          : "text-white/75 hover:bg-white/10 hover:text-white",
    );

  return (
    <header className="fixed inset-x-0 top-0 z-50 pt-3 sm:pt-4">
      <div className="site-container">
        <div
          className={cn(
            "relative flex h-16 items-center justify-between gap-3 rounded-full ps-3 pe-2 transition-all duration-300 sm:ps-4",
            glass
              ? "bg-white/80 text-(--site-text) shadow-[0_12px_40px_-16px] shadow-(--site-ink)/30 ring-1 ring-(--site-ink)/8 backdrop-blur-xl dark:bg-(--site-card)/80 dark:ring-white/10"
              : "bg-white/6 text-white ring-1 ring-white/12 backdrop-blur-md",
          )}
        >
          <Link href="/" onClick={closeAll} aria-label="Signet home" className="shrink-0">
            <SignetWordmark />
          </Link>

          <nav
            aria-label="Main"
            className={cn(
              "absolute start-1/2 hidden items-center gap-0.5 rounded-full p-1 transition-colors ltr:-translate-x-1/2 rtl:translate-x-1/2 lg:flex",
              glass ? "bg-(--site-bg)/80 ring-1 ring-(--site-line)" : "bg-white/6 ring-1 ring-white/10",
            )}
          >
            {(Object.keys(MENUS) as MenuKey[]).map((key) => {
              const menu = MENUS[key];
              const open = openMenu === key;
              return (
                // Not `relative`: the panel positions against the nav pill so every menu opens centered under the bar.
                <div key={key} onMouseEnter={() => openWithHover(key)} onMouseLeave={closeWithDelay} onBlur={closeOnBlur}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`site-menu-${key}`}
                    onClick={() => setOpenMenu(open ? null : key)}
                    className={navItemClass(open || isActive(pathname, menu.match))}
                  >
                    {menu.label}
                    <ChevronDown className={cn("size-3.5 opacity-60 transition-transform duration-200", open && "rotate-180")} />
                  </button>
                  <div
                    id={`site-menu-${key}`}
                    className={cn(
                      "absolute start-1/2 top-full pt-4 transition duration-200 ltr:-translate-x-1/2 rtl:translate-x-1/2",
                      open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1.5 opacity-0",
                    )}
                  >
                    <MenuPanel menu={key} onNavigate={closeAll} />
                  </div>
                </div>
              );
            })}
            {PLAIN_LINKS.map((link) => (
              <Link key={link.href} href={link.href} onClick={closeAll} className={navItemClass(isActive(pathname, link.match))}>
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <Link
              href="/signin"
              onClick={closeAll}
              className={cn(
                "hidden h-10 items-center rounded-full px-4 text-sm font-medium transition-colors sm:inline-flex",
                glass ? "text-(--site-text)/75 hover:text-(--site-text)" : "text-white/80 hover:text-white",
              )}
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              onClick={closeAll}
              className="group inline-flex h-11 items-center gap-2 rounded-full bg-(--site-accent) ps-5 pe-1.5 text-sm font-semibold text-white shadow-lg shadow-(--site-accent)/30 transition hover:bg-(--site-accent-hover)"
            >
              Get started
              <span className="grid size-8 place-items-center rounded-full bg-white text-(--site-accent)">
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
              </span>
            </Link>
            <button
              type="button"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="site-mobile-menu"
              onClick={() => setMobileOpen((value) => !value)}
              className={cn(
                "relative grid size-11 place-items-center rounded-full transition-colors lg:hidden",
                glass ? "bg-(--site-text)/5 hover:bg-(--site-text)/10" : "bg-white/10 hover:bg-white/15",
              )}
            >
              <span className="sr-only">Menu</span>
              <span aria-hidden className="relative block h-3.5 w-[18px]">
                <span className={cn("absolute inset-x-0 top-0 h-0.5 rounded-full bg-current transition-transform duration-300", mobileOpen && "translate-y-1.5 rotate-45")} />
                <span className={cn("absolute inset-x-0 top-1.5 h-0.5 rounded-full bg-current transition-opacity duration-200", mobileOpen && "opacity-0")} />
                <span className={cn("absolute inset-x-0 top-3 h-0.5 rounded-full bg-current transition-transform duration-300", mobileOpen && "-translate-y-1.5 -rotate-45")} />
              </span>
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div
            id="site-mobile-menu"
            className="mt-2 max-h-[calc(100dvh-6.5rem)] overflow-y-auto rounded-[1.75rem] bg-(--site-ink) p-3 text-white shadow-2xl shadow-black/40 ring-1 ring-white/10 lg:hidden"
          >
            <nav aria-label="Mobile">
              {(Object.keys(MENUS) as MenuKey[]).map((key) => (
                <div key={key} className="border-b border-white/10 px-1 pb-3 pt-2">
                  <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-(--site-accent-soft)">{MENUS[key].label}</p>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {MENUS[key].links.map((link, index) => {
                      const Icon = MENUS[key].icons[index];
                      return (
                        <li key={link.href}>
                          <Link href={link.href} onClick={closeAll} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-white/5">
                            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-(--site-accent)/20 text-(--site-accent-soft)">
                              <Icon className="size-4" />
                            </span>
                            <span>
                              <span className="block text-sm font-semibold">{link.label}</span>
                              <span className="block text-xs text-white/55">{link.description}</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <ul className="grid grid-cols-2 gap-2 px-1 py-3">
                {PLAIN_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={closeAll}
                      className={cn(
                        "flex h-12 items-center justify-center rounded-2xl bg-white/5 text-sm font-semibold transition hover:bg-white/10",
                        isActive(pathname, link.match) && "bg-(--site-accent)/25 text-white",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="grid gap-2 px-1 pb-1 sm:grid-cols-2">
                <Link href="/signin" onClick={closeAll} className="inline-flex h-12 items-center justify-center rounded-full ring-1 ring-white/20 text-sm font-semibold transition hover:bg-white/10">
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  onClick={closeAll}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-(--site-accent) text-sm font-semibold text-white transition hover:bg-(--site-accent-hover)"
                >
                  <Sparkles className="size-4" />
                  Create free account
                </Link>
              </div>
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  );
}
