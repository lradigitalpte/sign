"use client";

import { Building2, ChevronRight, Shield, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type ScopeConfig = {
  scope: "organisation" | "team" | "account";
  scopeLabel: string;
  scopeIcon: typeof Building2;
  pageTitle: string;
};

const PATH_MAP: Record<string, { scope: "organisation" | "team" | "account"; scopeLabel: string; pageTitle: string }> = {
  // Organisation Scope
  "/settings/company": { scope: "organisation", scopeLabel: "Organisation Settings", pageTitle: "General" },
  "/settings/preferences": { scope: "organisation", scopeLabel: "Organisation Settings", pageTitle: "Preferences" },
  "/settings/retention": { scope: "organisation", scopeLabel: "Organisation Settings", pageTitle: "Preferences & Retention" },
  "/settings/verification": { scope: "organisation", scopeLabel: "Organisation Settings", pageTitle: "Email Domains & ID" },
  "/settings/billing": { scope: "organisation", scopeLabel: "Organisation Settings", pageTitle: "Billing & Plans" },
  "/settings/sso": { scope: "organisation", scopeLabel: "Organisation Settings", pageTitle: "SSO & SAML" },
  "/settings/scim": { scope: "organisation", scopeLabel: "Organisation Settings", pageTitle: "SCIM Directory" },
  "/settings/crypto-keys": { scope: "organisation", scopeLabel: "Organisation Settings", pageTitle: "Crypto Keys" },
  "/settings/storage": { scope: "organisation", scopeLabel: "Organisation Settings", pageTitle: "Document Storage" },
  "/settings/audit": { scope: "organisation", scopeLabel: "Organisation Settings", pageTitle: "Audit Log" },

  // Team Scope
  "/settings/teams": { scope: "team", scopeLabel: "Team Settings", pageTitle: "Teams" },
  "/settings/groups": { scope: "team", scopeLabel: "Team Settings", pageTitle: "Member Groups" },
  "/settings/branding": { scope: "team", scopeLabel: "Team Settings", pageTitle: "General & Branding" },
  "/settings/notifications": { scope: "team", scopeLabel: "Team Settings", pageTitle: "Preferences & Notifications" },
  "/settings/public-profile": { scope: "team", scopeLabel: "Team Settings", pageTitle: "Public Profile" },
  "/settings/api-keys": { scope: "team", scopeLabel: "Team Settings", pageTitle: "API Tokens" },
  "/settings/webhooks": { scope: "team", scopeLabel: "Team Settings", pageTitle: "Webhooks" },
  "/settings/developer-logs": { scope: "team", scopeLabel: "Team Settings", pageTitle: "Developer Logs" },
  "/settings/tags": { scope: "team", scopeLabel: "Team Settings", pageTitle: "Document Tags" },
  "/settings/usage": { scope: "team", scopeLabel: "Team Settings", pageTitle: "Usage Analytics" },

  // Account Scope
  "/settings/profile": { scope: "account", scopeLabel: "Account Settings", pageTitle: "Profile" },
  "/settings/security": { scope: "account", scopeLabel: "Account Settings", pageTitle: "Security & 2FA" },
  "/settings/invoices": { scope: "account", scopeLabel: "Account Settings", pageTitle: "Invoices & Receipts" },
};

export function SettingsScopeBreadcrumb() {
  const pathname = usePathname();

  const config = PATH_MAP[pathname] || {
    scope: pathname.includes("security") || pathname.includes("profile") ? "account" : "organisation",
    scopeLabel: pathname.includes("security") || pathname.includes("profile") ? "Account Settings" : "Organisation Settings",
    pageTitle: pathname.split("/").filter(Boolean).pop()?.replace(/-/g, " ") || "Settings",
  };

  const Icon = config.scope === "organisation" ? Building2 : config.scope === "team" ? Users : User;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground border-b border-border/50 pb-3">
      <Link href="/settings/profile" className="hover:text-foreground transition-colors">
        Settings
      </Link>
      <ChevronRight className="size-3.5 opacity-50" />
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        <span>{config.scopeLabel}</span>
      </span>
      <ChevronRight className="size-3.5 opacity-50" />
      <span className="font-semibold text-foreground capitalize">
        {config.pageTitle}
      </span>
    </div>
  );
}
