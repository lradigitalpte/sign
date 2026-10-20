"use client";

import { Building2, ChevronRight, Clock3, User, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useMe } from "@/hooks/use-envelope-api";
import { scopeLabel, settingsPageFor, type SettingsScope } from "@/lib/settings-sections";

const ICONS: Record<SettingsScope, typeof Building2> = { account: User, organisation: Building2, team: UsersRound, soon: Clock3 };

/** Settings › level › page, with the level named for this person (their organisation, their team). */
export function SettingsScopeBreadcrumb() {
  const pathname = usePathname();
  const me = useMe().data;
  const page = settingsPageFor(pathname);
  // Pages not in the list (such as Billing's checkout step) belong to the organisation.
  const scope: SettingsScope = page?.scope ?? "organisation";
  const title = page?.label ?? (pathname.startsWith("/settings/billing/checkout") ? "Checkout" : pathname.split("/").filter(Boolean).pop()?.replace(/-/g, " ") || "Settings");
  const Icon = ICONS[scope];

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-border/50 pb-3 text-xs font-medium text-muted-foreground">
      <Link href="/settings/profile" className="transition-colors hover:text-foreground">
        Settings
      </Link>
      <ChevronRight className="size-3.5 opacity-50" />
      <span className="inline-flex items-center gap-1.5">
        <Icon className="size-3.5 text-primary" />
        <span>{scopeLabel(scope, { workspaceName: me?.workspace.name, teamName: me?.team?.name, teamIsDefault: me?.team?.isDefault })}</span>
      </span>
      <ChevronRight className="size-3.5 opacity-50" />
      <span className="font-semibold capitalize text-foreground">{title}</span>
    </div>
  );
}
