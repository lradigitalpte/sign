"use client";

import { ChevronLeft, ChevronRight, History, KeyRound, LockKeyhole, ShieldCheck, UnlockKeyhole } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

import { cn } from "@/lib/utils";

const storageKey = "signing-platform:pdf-security-nav-collapsed";
const navigation = [
  { label: "All files", href: "/encrypt/files", icon: History },
  { label: "Encrypt PDF", href: "/encrypt", icon: LockKeyhole, exact: true },
  { label: "Decrypt PDF", href: "/encrypt/decrypt", icon: UnlockKeyhole },
  { label: "Verify document", href: "/encrypt/verify", icon: ShieldCheck },
] as const;

export default function EncryptLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(storageKey) === "true";
  });
  const toggle = () => setCollapsed((current) => {
    const next = !current;
    localStorage.setItem(storageKey, String(next));
    return next;
  });

  return <div className="flex h-full min-h-0 bg-surface-subtle">
    <aside className={cn("hidden min-h-0 shrink-0 flex-col border-e bg-background transition-[width,padding] duration-200 lg:flex", collapsed ? "w-[76px] px-2" : "w-[260px] px-3")}>
      <div className="flex min-h-16 shrink-0 items-center gap-2 border-b px-1">
        <button type="button" aria-label={collapsed ? "Expand PDF security navigation" : "Collapse PDF security navigation"} onClick={toggle} className="grid size-8 shrink-0 place-items-center rounded-lg border bg-surface-subtle text-muted-foreground transition hover:border-primary hover:text-primary">
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
        {!collapsed ? <span className="truncate text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">PDF security</span> : null}
      </div>
      <nav aria-label="PDF security navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto py-4">
        {navigation.map(({ href, icon: Icon, label, ...rest }) => {
          const exact = "exact" in rest && rest.exact;
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link title={collapsed ? label : undefined} aria-current={active ? "page" : undefined} href={href} key={href} className={cn("group relative flex min-h-10 items-center rounded-e-lg text-sm transition", collapsed ? "justify-center px-2" : "gap-2.5 px-3", active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground")}>
            {!collapsed ? <span className={cn("absolute inset-y-2 start-0 w-1 rounded-e-full transition", active ? "bg-primary" : "bg-transparent group-hover:bg-primary")} /> : null}
            <Icon className={cn("size-[15px] shrink-0", active && "text-primary")} />
            {!collapsed ? <span className="truncate">{label}</span> : null}
          </Link>;
        })}
      </nav>
      <div className={cn("shrink-0 border-t py-4", collapsed ? "flex justify-center" : "px-2")}>
        <div className={cn("text-muted-foreground", collapsed ? "grid size-9 place-items-center rounded-lg bg-primary/10 text-primary" : "rounded-xl bg-primary/5 p-3")} title={collapsed ? "AES-256 protection" : undefined}>
          <div className="flex items-center gap-2 text-xs font-semibold text-primary"><KeyRound className="size-4 shrink-0" />{!collapsed ? "AES-256 protection" : null}</div>
          {!collapsed ? <p className="mt-1.5 text-[11px] leading-5">Protection stays with the downloaded PDF wherever it is opened.</p> : null}
        </div>
      </div>
    </aside>
    <section className="min-w-0 flex-1 overflow-y-auto">
      <nav aria-label="PDF security navigation" className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b bg-background/95 p-2 backdrop-blur lg:hidden">
        {navigation.map(({ href, icon: Icon, label, ...rest }) => {
          const exact = "exact" in rest && rest.exact;
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link aria-current={active ? "page" : undefined} href={href} key={href} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}><Icon className="size-3.5" />{label}</Link>;
        })}
      </nav>
      {children}
    </section>
  </div>;
}
