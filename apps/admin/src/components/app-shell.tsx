import { useAuth } from "@workos-inc/authkit-react";
import { Activity, Building2, CircleDollarSign, FileText, Flag, LayoutDashboard, LogOut, Mail, Megaphone, Monitor, Moon, ScrollText, ShieldCheck, Sun, Trash2, Users, Webhook } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { NavLink, Outlet } from "react-router";

import { Button } from "@signet/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@signet/ui/components/dropdown-menu";
import { SignetLogoIcon } from "@signet/ui/components/signet-logo";
import { cn } from "@signet/ui/lib/utils";

import { useAdmin } from "@/lib/admin-context";
import { InitialAvatar } from "@/components/initial-avatar";
import { RoleBadge } from "@/components/page";

type NavItem = { to: string; label: string; icon: typeof Mail; end?: boolean };

const nav: { label?: string; items: NavItem[] }[] = [
  { items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }] },
  {
    label: "Customers",
    items: [
      { to: "/workspaces", label: "Workspaces", icon: Building2 },
      { to: "/users", label: "Users", icon: Users },
      { to: "/envelopes", label: "Envelopes", icon: FileText },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/email-queue", label: "Email queue", icon: Mail },
      { to: "/webhooks", label: "Webhooks", icon: Webhook },
      { to: "/deletions", label: "Deletions", icon: Trash2 },
      { to: "/system", label: "System health", icon: Activity },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "/billing", label: "Plans & billing", icon: CircleDollarSign },
      { to: "/announcements", label: "Announcements", icon: Megaphone },
      { to: "/flags", label: "Feature flags", icon: Flag },
      { to: "/audit", label: "Audit log", icon: ScrollText },
      { to: "/admins", label: "Admins", icon: ShieldCheck },
    ],
  },
];

const environment = import.meta.env.MODE === "production" ? null : import.meta.env.MODE;

function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const options = [
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
    { key: "system", label: "System", icon: Monitor },
  ];
  return (
    <>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      {options.map(({ key, label, icon: Icon }) => (
        <DropdownMenuItem key={key} onSelect={() => setTheme(key)} className={cn(theme === key && "font-semibold")}>
          <Icon />
          {label}
        </DropdownMenuItem>
      ))}
    </>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin" className="grid gap-4">
      {nav.map((section, index) => (
        <div key={section.label ?? index} className="grid gap-0.5">
          {section.label ? <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{section.label}</p> : null}
          {section.items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function AppShell() {
  const admin = useAdmin();
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface-subtle lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden border-e bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <span className="grid size-8 place-items-center rounded-lg bg-primary">
            <SignetLogoIcon className="size-5 text-primary-foreground" />
          </span>
          <span className="font-semibold">Signet</span>
          <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">Admin</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <SidebarNav />
        </div>
        <div className="border-t p-3 text-xs text-muted-foreground">Every change you make is recorded in the audit log.</div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>
            Menu
          </Button>
          {environment ? <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium capitalize text-amber-700 dark:text-amber-300">{environment}</span> : null}
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center gap-3 rounded-full p-1 pe-3 transition-colors hover:bg-muted">
                <InitialAvatar name={admin.name} seed={admin.userId} size="sm" />
                <span className="hidden text-start sm:block">
                  <span className="block text-sm font-medium leading-tight">{admin.name}</span>
                  <span className="block text-xs text-muted-foreground">{admin.email}</span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex items-center justify-between gap-2">
                Signed in as <RoleBadge role={admin.role} />
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <ThemeMenu />
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => signOut({ returnTo: window.location.origin })}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {menuOpen ? (
          <div className="border-b bg-background p-3 lg:hidden">
            <SidebarNav onNavigate={() => setMenuOpen(false)} />
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
