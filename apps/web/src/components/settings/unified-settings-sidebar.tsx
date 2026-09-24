"use client";

import {
  Archive, BarChart3, Bell, Building2, ChevronDown, CreditCard, FileText,
  Fingerprint, Globe, HardDrive, KeyRound, Lock, Palette, Search, Settings2, ShieldCheck, Tag,
  Terminal, User, Users, Webhook, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ComponentType } from "react";

import { useMe } from "@/hooks/use-envelope-api";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: ComponentType<{ className?: string }>; badge?: string };
type Group = { label: string; items: Item[] };

const GROUPS: Group[] = [
  { label: "Account", items: [
    { href: "/settings/profile", label: "Profile", icon: User },
    { href: "/settings/security", label: "Security & 2FA", icon: ShieldCheck, badge: "Ready" },
    { href: "/settings/invoices", label: "Invoices", icon: FileText },
  ]},
  { label: "Workspace", items: [
    { href: "/settings/company", label: "Organization", icon: Building2 },
    { href: "/settings/teams", label: "Teams", icon: Users },
    { href: "/settings/groups", label: "Member groups", icon: Users },
    { href: "/settings/preferences", label: "Preferences", icon: Settings2 },
    { href: "/settings/branding", label: "Branding", icon: Palette },
    { href: "/settings/notifications", label: "Notifications", icon: Bell },
    { href: "/settings/public-profile", label: "Public profile", icon: Globe },
    { href: "/settings/tags", label: "Document tags", icon: Tag },
    { href: "/settings/usage", label: "Usage", icon: BarChart3 },
    { href: "/settings/billing", label: "Billing & plan", icon: CreditCard, badge: "Free" },
  ]},
  { label: "Developer", items: [
    { href: "/settings/api-keys", label: "API keys", icon: KeyRound },
    { href: "/settings/webhooks", label: "Webhooks", icon: Webhook },
    { href: "/settings/developer-logs", label: "Developer logs", icon: Terminal },
  ]},
];

const ENTERPRISE: Item[] = [
  { href: "/settings/sso", label: "SAML SSO", icon: Lock },
  { href: "/settings/scim", label: "SCIM provisioning", icon: Users },
  { href: "/settings/verification", label: "ID verification", icon: Fingerprint },
  { href: "/settings/audit", label: "Audit log", icon: FileText },
  { href: "/settings/retention", label: "Legal hold", icon: Archive },
  { href: "/settings/storage", label: "Document storage", icon: HardDrive, badge: "BYOS" },
  { href: "/settings/crypto-keys", label: "Crypto keys", icon: KeyRound },
];

function NavItem({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(
      "group flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-colors",
      active
        ? "bg-blue-600 text-white shadow-[0_8px_24px_-14px_rgba(37,99,235,.9)]"
        : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
    )}>
      <Icon className={cn("size-4 shrink-0", active ? "text-blue-100" : "text-muted-foreground group-hover:text-foreground")} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge && <span className={cn("rounded-md px-1.5 py-0.5 text-[9px] font-semibold", active ? "bg-white/15 text-white" : "bg-muted text-muted-foreground")}>{item.badge}</span>}
    </Link>
  );
}

export function UnifiedSettingsSidebar() {
  const pathname = usePathname();
  const me = useMe().data;
  const [query, setQuery] = useState("");
  const [enterpriseOpen, setEnterpriseOpen] = useState(ENTERPRISE.some((item) => item.href === pathname));
  const normalized = query.trim().toLowerCase();

  const visibleGroups = useMemo(() => GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !normalized || `${group.label} ${item.label}`.toLowerCase().includes(normalized)),
  })).filter((group) => group.items.length), [normalized]);
  const visibleEnterprise = ENTERPRISE.filter((item) => !normalized || `enterprise ${item.label}`.toLowerCase().includes(normalized));

  return (
    <div className="flex min-h-full flex-col" data-testid="unified-settings-sidebar">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Settings</p>
        <h2 className="mt-1 text-lg font-semibold tracking-[-.025em]">Workspace controls</h2>
      </div>

      <div className="mb-5 rounded-2xl border bg-gradient-to-br from-blue-50 to-card p-3.5 dark:from-blue-500/10 dark:to-card">
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-sm font-bold text-white">{(me?.workspace.name || "W").charAt(0).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{me?.workspace.name || "Workspace"}</p><p className="mt-0.5 text-[11px] capitalize text-muted-foreground">{me?.workspace.role || "Member"} · Free plan</p></div>
        </div>
      </div>

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search settings" aria-label="Search settings" className="h-10 w-full rounded-xl border bg-background pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:border-blue-500 focus:ring-3 focus:ring-blue-500/15" />
        {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>}
      </div>

      <div className="space-y-5">
        {visibleGroups.map((group) => <section key={group.label}>
          <h3 className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground/80">{group.label}</h3>
          <nav className="space-y-0.5">{group.items.map((item) => <NavItem key={item.href} item={item} active={pathname === item.href} />)}</nav>
        </section>)}

        {visibleEnterprise.length > 0 && <section className="border-t pt-4">
          <button type="button" onClick={() => setEnterpriseOpen((open) => !open)} className="mb-1 flex w-full items-center gap-2 px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground hover:text-foreground">
            <ShieldCheck className="size-3.5" /><span className="flex-1 text-left">Enterprise</span><ChevronDown className={cn("size-3.5 transition-transform", (enterpriseOpen || normalized) && "rotate-180")} />
          </button>
          {(enterpriseOpen || Boolean(normalized)) && <nav className="space-y-0.5">{visibleEnterprise.map((item) => <NavItem key={item.href} item={item} active={pathname === item.href} />)}</nav>}
        </section>}

        {visibleGroups.length === 0 && visibleEnterprise.length === 0 && <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No settings match “{query}”.</div>}
      </div>
    </div>
  );
}
