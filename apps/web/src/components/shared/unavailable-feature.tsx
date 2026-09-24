"use client";

import { Check, Loader2, Save, Settings2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useUpdateWorkspaceSettings, useWorkspaceSettings } from "@/hooks/use-envelope-api";
import type { WorkspaceSettings } from "@/lib/platform-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Field = { key: string; label: string; description: string; type: "toggle" | "text" | "number"; placeholder?: string; default: string | boolean | number };
type Section = { title: string; description: string; fields: Field[] };

const toggle = (key: string, label: string, description: string, value = false): Field => ({ key, label, description, type: "toggle", default: value });
const text = (key: string, label: string, description: string, placeholder = ""): Field => ({ key, label, description, type: "text", placeholder, default: "" });

const SECTIONS: Record<string, Section> = {
  preferences: { title: "Preferences", description: "Set the defaults used when your workspace creates and sends documents.", fields: [
    text("language", "Default language", "Used for new envelopes and recipient-facing emails.", "English"),
    text("timezone", "Workspace timezone", "Controls timestamps in documents, activity, and audit records.", "Etc/UTC"),
    text("dateFormat", "Date format", "The default format used for date fields.", "YYYY-MM-DD"),
    toggle("automaticReminders", "Automatic reminders", "Remind recipients when documents are waiting for their action.", true),
    { key: "firstReminderDays", label: "First reminder", description: "Days to wait before sending the first reminder.", type: "number", default: 3 },
    { key: "repeatReminderDays", label: "Repeat reminders", description: "Days between subsequent reminder emails.", type: "number", default: 3 },
    toggle("attachCompletedPdf", "Attach completed documents", "Include the completed PDF in the final confirmation email.", true),
    toggle("completionCertificate", "Completion certificate", "Generate an audit certificate with every completed envelope.", true),
  ] },
  security: { title: "Security & 2FA", description: "Control sign-in protection and session security for your workspace.", fields: [toggle("require2fa", "Require two-factor authentication", "Members must configure 2FA before accessing workspace documents."), toggle("loginAlerts", "New login alerts", "Email members when their account is accessed from a new device.", true), { key: "sessionMinutes", label: "Session timeout", description: "Minutes of inactivity before members must sign in again.", type: "number", default: 60 }] },
  branding: { title: "Branding", description: "Customize the sender experience across emails and signing pages.", fields: [text("brandName", "Brand name", "Displayed to recipients during signing.", "Your company"), text("primaryColor", "Primary color", "Use a CSS hex color such as #2563eb.", "#2563eb"), toggle("hidePlatformBranding", "Hide platform branding", "Use only your organization identity on recipient pages.")] },
  notifications: { title: "Notifications", description: "Choose which workspace activity should trigger an email.", fields: [toggle("envelopeCompleted", "Envelope completed", "Notify senders when every recipient has completed an envelope.", true), toggle("recipientViewed", "Recipient viewed", "Notify the sender the first time an envelope is opened.", true), toggle("dailyDigest", "Daily activity digest", "Send workspace administrators a daily summary.")] },
  "public-profile": { title: "Public Profile", description: "Configure the identity recipients see before they sign.", fields: [toggle("enabled", "Enable public profile", "Allow recipients to view your verified sender profile."), text("headline", "Headline", "A short description shown beneath your organization name.", "Trusted digital documents"), text("website", "Website", "A link recipients can use to learn more.", "https://example.com")] },
  billing: { title: "Billing", description: "Configure billing contacts and renewal preferences.", fields: [text("billingEmail", "Billing email", "Invoices and payment notices are sent here.", "billing@example.com"), toggle("renewalEmails", "Renewal reminders", "Send reminders before subscriptions renew.", true), toggle("usageAlerts", "Usage alerts", "Warn administrators when usage approaches plan limits.", true)] },
  invoices: { title: "Invoices", description: "Set the company information printed on invoices.", fields: [text("legalName", "Legal company name", "The registered name used for billing."), text("taxId", "Tax ID", "VAT, GST, or other tax registration number."), text("billingAddress", "Billing address", "The address displayed on invoices.")] },
  usage: { title: "Usage", description: "Set proactive limits for document activity.", fields: [{ key: "monthlyEnvelopeLimit", label: "Monthly envelope alert", description: "Alert administrators when this many envelopes are sent.", type: "number", default: 500 }, toggle("weeklyReport", "Weekly usage report", "Email a weekly summary to workspace administrators.")] },
  "api-keys": { title: "API Keys", description: "Configure API access policy for workspace integrations.", fields: [toggle("enabled", "Enable API access", "Allow administrators to create scoped API credentials."), text("allowedOrigins", "Allowed origins", "Comma-separated origins permitted to call the API."), toggle("rotationReminder", "90-day rotation reminder", "Remind key owners to rotate credentials.", true)] },
  webhooks: { title: "Webhooks", description: "Deliver real-time envelope events to your application.", fields: [text("endpoint", "Endpoint URL", "HTTPS destination for signed event payloads.", "https://example.com/webhooks"), toggle("completed", "Envelope completed", "Send events when an envelope is completed.", true), toggle("declined", "Envelope declined", "Send events when a recipient declines.", true)] },
  tags: { title: "Tags", description: "Define default metadata used to organize envelopes.", fields: [text("defaultTags", "Default tags", "Comma-separated tags applied to new envelopes."), toggle("allowCustomTags", "Allow custom tags", "Members may create tags while preparing envelopes.", true)] },
  sso: { title: "SAML SSO", description: "Configure enterprise identity-provider access.", fields: [toggle("enabled", "Enable SAML SSO", "Use your identity provider for workspace authentication."), text("domain", "Verified domain", "Domain routed through your SSO connection.", "company.com"), toggle("enforce", "Enforce SSO", "Prevent password-based access for verified domains.")] },
  scim: { title: "SCIM Provisioning", description: "Automate member provisioning and deactivation.", fields: [toggle("enabled", "Enable SCIM", "Allow your directory to manage workspace members."), text("directoryId", "Directory ID", "Identifier supplied by your directory provider."), toggle("removeDeactivated", "Remove deactivated users", "Revoke workspace access when users leave your directory.", true)] },
  verification: { title: "ID Verification", description: "Set identity requirements for sensitive documents.", fields: [toggle("enabled", "Enable ID verification", "Allow senders to require recipient identity checks."), toggle("governmentId", "Government ID", "Allow passport and driving-license verification."), toggle("selfieMatch", "Selfie match", "Compare a live selfie to the submitted identity document.")] },
  audit: { title: "Audit Log", description: "Control retention and export options for compliance activity.", fields: [toggle("adminExports", "Allow administrator exports", "Administrators can export workspace audit events.", true), { key: "retentionDays", label: "Retention period", description: "Number of days audit events remain available.", type: "number", default: 365 }] },
  "developer-logs": { title: "Developer Logs", description: "Choose which integration diagnostics are retained.", fields: [toggle("apiRequests", "API request logs", "Retain metadata for authenticated API requests.", true), toggle("webhookBodies", "Webhook delivery bodies", "Retain payloads for delivery troubleshooting."), { key: "retentionDays", label: "Log retention", description: "Days before developer logs are removed.", type: "number", default: 30 }] },
  retention: { title: "Legal Hold", description: "Preserve records according to your compliance policy.", fields: [toggle("legalHold", "Enable legal hold", "Prevent permanent deletion of completed documents."), { key: "retentionYears", label: "Document retention", description: "Years completed documents should be retained.", type: "number", default: 7 }] },
  "crypto-keys": { title: "Crypto Keys", description: "Manage workspace encryption-key policy.", fields: [toggle("customerManaged", "Customer-managed keys", "Use an organization-controlled key for document encryption."), text("keyAlias", "Key alias", "Cloud KMS key alias or identifier."), toggle("annualRotation", "Automatic annual rotation", "Rotate active encryption material every year.", true)] },
};

function SettingsEditor({ section, definition }: { section: string; definition: Section }) {
  const query = useWorkspaceSettings(section);
  const mutation = useUpdateWorkspaceSettings(section);
  const [values, setValues] = useState<WorkspaceSettings>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (query.data) {
      setValues(Object.fromEntries(definition.fields.map((field) => [field.key, query.data[field.key] ?? field.default])));
      setDirty(false);
    }
  }, [query.data, definition]);

  function change(key: string, value: string | boolean | number) { setValues((current) => ({ ...current, [key]: value })); setDirty(true); mutation.reset(); }

  return <main className="mx-auto w-full max-w-4xl px-3 py-8 sm:px-0 lg:py-10">
    <header className="flex flex-col justify-between gap-5 border-b pb-7 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">Workspace settings</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">{definition.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{definition.description}</p></div><div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"><ShieldCheck className="size-6" /></div></header>
    {query.isLoading ? <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Loading settings…</div> :
      <section className="mt-7 overflow-hidden rounded-3xl border bg-card shadow-sm"><div className="divide-y">
        {definition.fields.map((field) => <div key={field.key} className="grid gap-4 p-5 sm:grid-cols-[1fr_minmax(220px,320px)] sm:items-center sm:p-6"><div><h2 className="text-sm font-semibold">{field.label}</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">{field.description}</p></div>{field.type === "toggle" ? <button type="button" role="switch" aria-checked={Boolean(values[field.key])} onClick={() => change(field.key, !values[field.key])} className={`relative ml-auto h-7 w-12 rounded-full transition ${values[field.key] ? "bg-blue-600" : "bg-muted"}`}><span className={`absolute top-1 size-5 rounded-full bg-white shadow-sm transition ${values[field.key] ? "left-6" : "left-1"}`} /></button> : <Input type={field.type} value={String(values[field.key] ?? field.default)} placeholder={field.placeholder} onChange={(event) => change(field.key, field.type === "number" ? Number(event.target.value) : event.target.value)} />}</div>)}
      </div><footer className="flex flex-col gap-3 border-t bg-surface-subtle/60 p-5 sm:flex-row sm:items-center sm:justify-between"><p className={`text-sm ${mutation.isError ? "text-destructive" : "text-emerald-600"}`}>{mutation.isError ? (mutation.error instanceof Error ? mutation.error.message : "Unable to save settings.") : mutation.isSuccess ? <span className="flex items-center gap-1.5"><Check className="size-4" /> Settings saved</span> : dirty ? "You have unsaved changes." : "All changes are saved."}</p><Button disabled={!dirty || mutation.isPending} onClick={async () => { await mutation.mutateAsync(values); setDirty(false); }}><Save /> {mutation.isPending ? "Saving…" : "Save changes"}</Button></footer></section>}
  </main>;
}

export function UnavailableFeature({ title, description }: { title?: string; description?: string }) {
  const pathname = usePathname();
  const section = pathname.split("/").filter(Boolean).at(-1) ?? "";
  const definition = SECTIONS[section];
  if (definition) return <SettingsEditor section={section} definition={definition} />;
  return <main className="mx-auto w-full max-w-[720px] px-3 py-16 sm:px-5"><div className="rounded-3xl border bg-background p-8 text-center shadow-sm"><Settings2 className="mx-auto size-8 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold">{title ?? "This feature is not available yet"}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{description ?? "This screen is not connected to the live API."}</p><Button asChild className="mt-6"><Link href="/envelopes">Back to envelopes</Link></Button></div></main>;
}
