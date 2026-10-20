"use client";

import { Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";

// Features that aren't built yet. Their pages say so instead of showing settings that would do nothing.
export const COMING_SOON: Record<string, { title: string; description: string }> = {
  "api-keys": { title: "API keys", description: "Create keys so your own software can send envelopes and read their status through the Signet API." },
  webhooks: { title: "Webhooks", description: "Get an instant HTTPS callback in your app when an envelope is viewed, signed, declined or completed." },
  "developer-logs": { title: "Developer logs", description: "See every API request and webhook delivery for troubleshooting your integration." },
  sso: { title: "SAML single sign-on", description: "Let members sign in through your identity provider, such as Okta, Microsoft Entra ID or Google Workspace." },
  scim: { title: "SCIM provisioning", description: "Add and remove members automatically from your company directory." },
  verification: { title: "ID verification", description: "Ask signers to verify their identity with a government ID before they can sign." },
  audit: { title: "Workspace audit log", description: "One searchable log of everything members do across the workspace. Each envelope already has its own audit trail." },
  "crypto-keys": { title: "Customer-managed keys", description: "Encrypt documents with a key you control in your own cloud key management service." },
  "public-profile": { title: "Public profile", description: "A verified page for your organization that recipients can check before they sign." },
  tags: { title: "Document tags", description: "Label envelopes so your team can group and find them." },
};

export function ComingSoon({ title, description, backHref = "/settings", backLabel = "Back to settings" }: { title: string; description: string; backHref?: string; backLabel?: string }) {
  return <main className="mx-auto w-full max-w-[720px] px-3 py-16 sm:px-5"><div className="rounded-3xl border bg-background p-8 text-center shadow-sm"><span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Coming soon</span><h1 className="mt-4 text-xl font-semibold">{title}</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p><p className="mt-4 text-xs text-muted-foreground">This isn&apos;t available yet and isn&apos;t part of any plan today.</p><Button asChild variant="outline" className="mt-6"><Link href={backHref}>{backLabel}</Link></Button></div></main>;
}

/** A settings page for a feature that isn't built: "Coming soon" with what it will do. */
export function UnavailableFeature({ title, description }: { title?: string; description?: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const section = segments[0] === "settings" && segments.length === 2 ? segments[1] : "";
  if (COMING_SOON[section]) return <ComingSoon {...COMING_SOON[section]} />;
  return <main className="mx-auto w-full max-w-[720px] px-3 py-16 sm:px-5"><div className="rounded-3xl border bg-background p-8 text-center shadow-sm"><Settings2 className="mx-auto size-8 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold">{title ?? "This feature is not available yet"}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{description ?? "This screen is not connected to the live API."}</p><Button asChild className="mt-6"><Link href="/envelopes">Back to envelopes</Link></Button></div></main>;
}
