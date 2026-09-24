"use client";

import { ArrowLeft, Building2, ChevronDown, CircleHelp, FileKey2, FilePenLine, FileSignature, FileText, Inbox, LayoutDashboard, Library, LogOut, Menu, PenTool, Plus, Search, Settings, UserRound, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";

import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { OrgMenuSwitcher } from "@/components/shared/org-menu-switcher";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useMe } from "@/hooks/use-envelope-api";

const navigation = [
  { key: "overview", href: "/dashboard", icon: LayoutDashboard },
  { key: "inbox", href: "/inbox", icon: Inbox },
  { key: "envelopes", href: "/envelopes", icon: FileText },
  { key: "templates", href: "/templates", icon: Library },
  { key: "selfSign", href: "/self-sign", icon: FilePenLine },
  { key: "signature", href: "/signature", icon: PenTool },
  { key: "encrypt", href: "/encrypt", icon: FileKey2 },
  { key: "members", href: "/members", icon: Users },
] as const;

type WorkspaceLayoutProps = { children: ReactNode; activeItem?: string; companyName?: string };

function WorkspaceRail({ activeItem, mobile = false }: { activeItem: string; mobile?: boolean }) {
  const t = useTranslations("AppShell");
  return <div className="flex h-full flex-col items-center">
    <Link aria-label={t("productName")} className="mb-5 grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_20%,transparent),0_8px_20px_-8px_color-mix(in_oklch,var(--primary)_65%,transparent)]" href="/dashboard"><FileSignature className="size-5" /></Link>
    <nav aria-label={t("primaryNavigation")} className={cn("flex w-full flex-1 flex-col gap-1 overflow-y-auto", mobile && "items-stretch")}>
      {navigation.map(({ href, icon: Icon, key }) => { const active = activeItem === key; return <Link aria-current={active ? "page" : undefined} className={cn("group flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[10px] font-semibold text-white/65 transition hover:bg-white/10 hover:text-white", active && "bg-blue-400/20 text-white ring-1 ring-inset ring-blue-300/35", mobile && "min-h-12 flex-row justify-start gap-3 px-3 text-sm")} href={href} key={key}><Icon className={cn("size-5", active && "text-blue-200 drop-shadow-[0_0_7px_rgba(147,197,253,.5)]")} strokeWidth={1.8} /><span>{t(`navigation.${key}`)}</span></Link>; })}
    </nav>
    <Link className={cn("mt-3 flex min-h-14 w-full flex-col items-center justify-center gap-1 border-t border-white/10 pt-3 text-[10px] font-semibold text-white/65 transition hover:text-white", activeItem === "settings" && "text-white", mobile && "min-h-12 flex-row justify-start gap-3 px-3 text-sm")} href="/settings/profile"><Settings className="size-5" strokeWidth={1.8} /><span>{t("settings")}</span></Link>
  </div>;
}

function HeaderActions({ companyName, userName, userEmail }: { companyName: string; userName: string; userEmail: string }) {
  const t = useTranslations("AppShell");
  return (
    <div className="ms-auto flex items-center gap-1 sm:gap-2">
      <Button aria-label={t("help")} className="hidden sm:inline-flex" size="icon" variant="ghost">
        <CircleHelp />
      </Button>
      <ThemeSwitcher />
      <LocaleSwitcher />
      <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
      <OrgMenuSwitcher companyName={companyName} userName={userName} userEmail={userEmail} />
    </div>
  );
}

function WorkspaceSearch() {
  const t = useTranslations("AppShell");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/envelopes?q=${encodeURIComponent(value)}` : "/envelopes");
  };
  return (
    <form className="relative hidden min-w-40 max-w-xl flex-1 md:block" onSubmit={onSubmit}>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        aria-label={t("search")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-9 w-full rounded-xl border bg-surface-subtle ps-9 pe-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-3 focus-visible:ring-3 focus:ring-ring/30"
        placeholder={t("searchPlaceholder")}
      />
    </form>
  );
}

function WorkspaceLayout({ children, activeItem = "overview" }: WorkspaceLayoutProps) {
  const t = useTranslations("AppShell");
  const pathname = usePathname();
  const meQuery = useMe();
  const companyName = meQuery.data?.workspace.name ?? "Workspace";

  // When inside /settings, render standalone settings layout without main navigation rail
  if (pathname.startsWith("/settings")) {
    return (
      <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
        {/* Dedicated Standalone Settings Header */}
        <header className="flex min-h-14 h-14 shrink-0 items-center justify-between border-b bg-card/80 backdrop-blur-md px-4 sm:px-6 z-20">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="gap-2 text-xs font-semibold rounded-xl hover:bg-muted/70 text-muted-foreground hover:text-foreground h-8 px-2.5"
            >
              <Link href="/dashboard">
                <ArrowLeft className="size-4" />
                <span className="hidden sm:inline">Back to Workspace</span>
              </Link>
            </Button>
            <span className="h-4 w-px bg-border/80" />
            <div className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-xs">
                <FileSignature className="size-4" />
              </div>
              <span className="text-sm font-bold tracking-tight text-foreground hidden sm:inline">Settings</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <LocaleSwitcher />
            <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
            <OrgMenuSwitcher
              companyName={companyName}
              userName={meQuery.data?.user.name ?? ""}
              userEmail={meQuery.data?.user.email ?? ""}
            />
          </div>
        </header>

        {/* Dedicated Standalone Settings Canvas */}
        <div className="min-h-0 flex-1 overflow-hidden bg-background">
          {children}
        </div>
      </div>
    );
  }

  const routeActiveItem = navigation.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`))?.key ?? activeItem;
  const currentTitle = t(`navigation.${routeActiveItem}`);
  return <div className="workspace-canvas h-dvh overflow-hidden p-2 text-foreground sm:p-3">
    <div className="flex h-full min-h-0 gap-2">
      <aside className="hidden w-20 shrink-0 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,#153b70_0%,#0a1f3d_100%)] p-2 shadow-[0_10px_36px_rgba(8,32,68,.38)] lg:block"><WorkspaceRail activeItem={routeActiveItem} /></aside>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-background shadow-[0_12px_38px_-20px_rgba(15,23,42,.28)]">
        <header className="flex min-h-16 shrink-0 items-center gap-3 border-b bg-background px-3 sm:px-5">
          <Dialog><DialogTrigger asChild><Button aria-label={t("openMenu")} className="lg:hidden" size="icon" variant="ghost"><Menu /></Button></DialogTrigger><DialogContent className="inset-y-2 start-2 top-2 h-[calc(100dvh-1rem)] max-w-64 translate-x-0 translate-y-0 rounded-2xl border-white/10 bg-[linear-gradient(180deg,#153b70_0%,#0a1f3d_100%)] p-3 text-white" showCloseButton><DialogTitle className="sr-only">{t("menu")}</DialogTitle><WorkspaceRail activeItem={routeActiveItem} mobile /></DialogContent></Dialog>
          <h1 className="hidden shrink-0 text-lg font-semibold tracking-[-0.025em] sm:block">{currentTitle}</h1>
          <WorkspaceSearch />
          <HeaderActions companyName={companyName} userName={meQuery.data?.user.name ?? ""} userEmail={meQuery.data?.user.email ?? ""} />
        </header>
        <div className={cn("min-h-0 flex-1 bg-surface-subtle", pathname.startsWith("/inbox/sign") || pathname.startsWith("/encrypt") ? "overflow-hidden" : "overflow-y-auto")}>{children}</div>
      </section>
    </div>
  </div>;
}

type AppShellProps = WorkspaceLayoutProps & { title: string; description?: string; actions?: ReactNode };
function AppShell({ actions, children, description, title, ...layoutProps }: AppShellProps) {
  return <WorkspaceLayout {...layoutProps}><main className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{title}</h1>{description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}</div>{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}</div><div className="mt-8">{children}</div></main></WorkspaceLayout>;
}

export { AppShell, WorkspaceLayout };
