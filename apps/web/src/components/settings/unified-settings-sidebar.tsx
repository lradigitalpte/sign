"use client";

import { Building2, ChevronDown, Clock3, Search, User, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useMe, useSubscription } from "@/hooks/use-envelope-api";
import { getPlan } from "@/lib/plans";
import { SETTINGS_PAGES, scopeLabel, type SettingsPage, type SettingsScope } from "@/lib/settings-sections";
import { cn } from "@/lib/utils";

function NavItem({ item, active }: { item: SettingsPage; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(
      "group flex h-9 items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition-colors",
      active ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      item.scope === "soon" && !active && "opacity-70",
    )}>
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge && <span className={cn("rounded-md px-1.5 py-0.5 text-[9px] font-semibold", active ? "bg-white/15 text-white" : "bg-muted text-muted-foreground")}>{item.badge}</span>}
    </Link>
  );
}

// Each level has its own colour, used for its heading icon.
const SECTION_STYLE: Partial<Record<SettingsScope, { icon: typeof User; className: string }>> = {
  account: { icon: User, className: "bg-blue-500/10 text-blue-600 dark:text-blue-300" },
  organisation: { icon: Building2, className: "bg-violet-500/10 text-violet-600 dark:text-violet-300" },
  team: { icon: UsersRound, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" },
};

export function UnifiedSettingsSidebar() {
  const pathname = usePathname();
  const me = useMe().data;
  const subscription = useSubscription().data;
  const planName = getPlan(subscription?.plan ?? "")?.name ?? "Free";
  const team = me?.team;
  const [query, setQuery] = useState("");
  const [soonOpen, setSoonOpen] = useState(SETTINGS_PAGES.some((page) => page.scope === "soon" && page.href === pathname));
  const normalized = query.trim().toLowerCase();
  const context = { workspaceName: me?.workspace.name, teamName: team?.name, teamIsDefault: team?.isDefault };

  const pagesIn = (scope: SettingsScope) =>
    SETTINGS_PAGES.filter((page) => page.scope === scope && (!normalized || `${scopeLabel(scope, context)} ${page.label}`.toLowerCase().includes(normalized)))
      .map((page) => (page.href === "/settings/billing" ? { ...page, badge: planName } : page));
  const isActive = (page: SettingsPage) => pathname === page.href || (page.href === "/members" && pathname.startsWith("/members"));
  const sections = (["account", "organisation", "team"] as const).map((scope) => ({ scope, pages: pagesIn(scope) })).filter((section) => section.pages.length);
  const soon = pagesIn("soon");

  return (
    <div className="flex min-h-full flex-col" data-testid="unified-settings-sidebar">
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-[-.025em]">Settings</h2>
      </div>

      <div className="mb-5 rounded-2xl border bg-gradient-to-br from-blue-50 to-card p-3.5 dark:from-blue-500/10 dark:to-card">
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-sm font-bold text-white">{(me?.workspace.name || "W").charAt(0).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{me?.workspace.name || "Workspace"}</p>
            <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">{me?.workspace.role || "Member"} · {planName} plan</p>
          </div>
        </div>
        {team ? (
          <p className="mt-2.5 flex items-center gap-1.5 border-t pt-2.5 text-xs text-muted-foreground">
            <UsersRound className="size-3.5 shrink-0" />
            <span className="truncate">Working in <span className="font-semibold text-foreground">{team.name}</span>{team.isDefault ? " (default team)" : ""}</span>
          </p>
        ) : null}
      </div>

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search settings" aria-label="Search settings" className="h-10 w-full rounded-xl border bg-background pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:border-blue-500 focus:ring-3 focus:ring-blue-500/15" />
        {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>}
      </div>

      <div className="space-y-5">
        {sections.map(({ scope, pages }) => (
          <section key={scope}>
            <h3 className="mb-1.5 flex items-center gap-2 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground/80">
              {(() => {
                const style = SECTION_STYLE[scope];
                if (!style) return null;
                const Icon = style.icon;
                return <span className={cn("grid size-5 shrink-0 place-items-center rounded-md", style.className)}><Icon className="size-3" /></span>;
              })()}
              <span className="min-w-0 truncate">{scopeLabel(scope, context)}</span>
            </h3>
            <nav className="space-y-0.5">{pages.map((page) => <NavItem key={page.href} item={page} active={isActive(page)} />)}</nav>
          </section>
        ))}

        {soon.length > 0 && (
          <section className="border-t pt-4">
            <button type="button" onClick={() => setSoonOpen((open) => !open)} aria-expanded={soonOpen || Boolean(normalized)} className="mb-1 flex w-full items-center gap-2 px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground hover:text-foreground">
              <Clock3 className="size-3.5" /><span className="flex-1 text-left">Coming soon</span><span className="font-medium normal-case tracking-normal">{soon.length}</span><ChevronDown className={cn("size-3.5 transition-transform", (soonOpen || normalized) && "rotate-180")} />
            </button>
            {(soonOpen || Boolean(normalized)) && <nav className="space-y-0.5">{soon.map((page) => <NavItem key={page.href} item={page} active={isActive(page)} />)}</nav>}
          </section>
        )}

        {sections.length === 0 && soon.length === 0 && <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No settings match “{query}”.</div>}
      </div>
    </div>
  );
}
