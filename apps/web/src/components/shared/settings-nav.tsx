"use client";

import {
  Archive,
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  Fingerprint,
  Globe,
  HardDrive,
  KeyRound,
  Lock,
  Palette,
  ShieldCheck,
  Tag,
  Terminal,
  User,
  Users,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const MAIN_NAV = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/security", label: "Security & 2FA", icon: ShieldCheck },
  { href: "/settings/company", label: "Organization", icon: Building2 },
  { href: "/settings/branding", label: "Branding", icon: Palette },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/public-profile", label: "Public Profile", icon: Globe },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/settings/invoices", label: "Invoices", icon: FileText },
  { href: "/settings/usage", label: "Usage", icon: BarChart3 },
  { href: "/settings/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/settings/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/settings/tags", label: "Tags", icon: Tag },
];

const ENTERPRISE_NAV = [
  { href: "/settings/sso", label: "SAML SSO", icon: Lock },
  { href: "/settings/scim", label: "SCIM", icon: Users },
  { href: "/settings/verification", label: "ID Verification", icon: Fingerprint },
  { href: "/settings/audit", label: "Audit Log", icon: ClipboardList },
  { href: "/settings/developer-logs", label: "Dev Logs", icon: Terminal },
  { href: "/settings/retention", label: "Legal Hold", icon: Archive },
  { href: "/settings/storage", label: "Document Storage", icon: HardDrive },
  { href: "/settings/crypto-keys", label: "Crypto Keys", icon: KeyRound },
];

export function SettingsNav({ variant = "inline" }: { variant?: "inline" | "persistent" }) {
  const pathname = usePathname();
  const [showEnterprise, setShowEnterprise] = useState(
    ENTERPRISE_NAV.some((i) => i.href === pathname)
  );

  const isActive = (href: string) => pathname === href;

  return (
    <nav className={`${variant === "persistent" ? "settings-nav-persistent border-b pb-3 lg:w-60 lg:rounded-3xl lg:border lg:bg-card lg:p-3 lg:shadow-sm" : "settings-nav-inline mb-6 border-b pb-3"}`}>
      <div className="mb-3 hidden px-3 pt-1 lg:block">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Settings</p>
        <p className="mt-1 text-sm font-semibold text-foreground">Workspace preferences</p>
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold lg:flex-col lg:items-stretch lg:overflow-visible">
        {MAIN_NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 transition lg:w-full ${
              isActive(href)
                ? "bg-blue-600 text-white shadow-[0_8px_22px_-12px_rgba(37,99,235,.9)] font-bold ring-1 ring-inset ring-blue-400/40"
                : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
            }`}
          >
            <Icon className="size-4 shrink-0" />
            <span>{label}</span>
          </Link>
        ))}
        <button
          onClick={() => setShowEnterprise((v) => !v)}
          className="flex shrink-0 items-center gap-3 rounded-xl border border-dashed px-3.5 py-2.5 text-muted-foreground transition hover:bg-surface-subtle hover:text-foreground lg:mt-2 lg:w-full lg:border-x-0 lg:border-b-0 lg:rounded-none lg:pt-3"
        >
          <ShieldCheck className="size-3.5" />
          <span>Enterprise ···</span>
        </button>
      </div>

      {showEnterprise && (
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto border-t border-dashed pt-2 text-xs font-semibold lg:flex-col lg:items-stretch lg:overflow-visible lg:border-t-0 lg:pt-0">
          {ENTERPRISE_NAV.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 transition lg:w-full ${
                isActive(href)
                  ? "bg-blue-600 text-white shadow-[0_8px_22px_-12px_rgba(37,99,235,.9)] font-bold ring-1 ring-inset ring-blue-400/40"
                  : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
