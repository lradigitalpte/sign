import {
  Archive, BarChart3, Bell, Building2, CreditCard, Database, FileText, Fingerprint, Globe, HardDrive,
  KeyRound, Lock, Palette, ShieldCheck, SlidersHorizontal, Tag, Terminal, User, Users, UsersRound, Webhook,
  type LucideIcon,
} from "lucide-react";

// Every settings page and the level it applies to, shared by the settings sidebar and breadcrumb:
//   account       you, wherever you work
//   organisation  the whole workspace: billing, people, teams, data
//   team          the team you're working in (the default team's settings are the organisation's defaults)
//   soon          not built yet

export type SettingsScope = "account" | "organisation" | "team" | "soon";

export type SettingsPage = { href: string; label: string; icon: LucideIcon; scope: SettingsScope; badge?: string };

export const SETTINGS_PAGES: SettingsPage[] = [
  { href: "/settings/profile", label: "Profile", icon: User, scope: "account" },
  { href: "/settings/security", label: "Security", icon: ShieldCheck, scope: "account" },

  { href: "/settings/company", label: "General", icon: Building2, scope: "organisation" },
  { href: "/members", label: "Members", icon: Users, scope: "organisation" },
  { href: "/settings/teams", label: "Teams", icon: UsersRound, scope: "organisation" },
  { href: "/settings/groups", label: "Member groups", icon: Users, scope: "organisation" },
  { href: "/settings/billing", label: "Billing & plan", icon: CreditCard, scope: "organisation" },
  { href: "/settings/invoices", label: "Invoices", icon: FileText, scope: "organisation" },
  { href: "/settings/usage", label: "Usage", icon: BarChart3, scope: "organisation" },
  { href: "/settings/data", label: "Data & privacy", icon: Database, scope: "organisation" },
  { href: "/settings/retention", label: "Retention & legal hold", icon: Archive, scope: "organisation" },
  { href: "/settings/storage", label: "Document storage", icon: HardDrive, scope: "organisation", badge: "Enterprise" },

  { href: "/settings/preferences", label: "Preferences", icon: SlidersHorizontal, scope: "team" },
  { href: "/settings/notifications", label: "Notifications", icon: Bell, scope: "team" },
  { href: "/settings/branding", label: "Branding", icon: Palette, scope: "team" },

  { href: "/settings/public-profile", label: "Public profile", icon: Globe, scope: "soon" },
  { href: "/settings/tags", label: "Document tags", icon: Tag, scope: "soon" },
  { href: "/settings/api-keys", label: "API keys", icon: KeyRound, scope: "soon" },
  { href: "/settings/webhooks", label: "Webhooks", icon: Webhook, scope: "soon" },
  { href: "/settings/developer-logs", label: "Developer logs", icon: Terminal, scope: "soon" },
  { href: "/settings/sso", label: "SAML SSO", icon: Lock, scope: "soon" },
  { href: "/settings/scim", label: "SCIM provisioning", icon: Users, scope: "soon" },
  { href: "/settings/verification", label: "ID verification", icon: Fingerprint, scope: "soon" },
  { href: "/settings/audit", label: "Audit log", icon: FileText, scope: "soon" },
  { href: "/settings/crypto-keys", label: "Crypto keys", icon: KeyRound, scope: "soon" },
];

export function settingsPageFor(pathname: string) {
  return SETTINGS_PAGES.find((page) => page.href === pathname);
}

/** How a level is named for the person looking: the team level is named after the team they're in. */
export function scopeLabel(scope: SettingsScope, context: { workspaceName?: string; teamName?: string; teamIsDefault?: boolean }) {
  switch (scope) {
    case "account":
      return "Account";
    case "organisation":
      return context.workspaceName ? `Organisation · ${context.workspaceName}` : "Organisation";
    case "team":
      return context.teamName && !context.teamIsDefault ? `Team · ${context.teamName}` : "Defaults for every team";
    case "soon":
      return "Coming soon";
  }
}
