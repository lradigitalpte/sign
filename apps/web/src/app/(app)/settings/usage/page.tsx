"use client";

import Link from "next/link";
import { Check, Loader2, Lock, Send, Users } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/use-envelope-api";
import { getPlan } from "@/lib/plans";
import { cn } from "@/lib/utils";

// Usage against the workspace's plan, from GET /v1/workspace/entitlements. The features and their
// minimum plans mirror internal/billing/entitlements.go.
const FEATURES: { key: string; label: string; plan: string }[] = [
  { key: "signing_links", label: "Delivery by signing link", plan: "business" },
  { key: "redirect_after_signing", label: "Redirect signers after signing", plan: "business" },
  { key: "advanced_fields", label: "Dropdown, radio and file-upload fields", plan: "business" },
  { key: "attachments", label: "Attachments on envelopes", plan: "business" },
  { key: "shared_folders", label: "Shared folders", plan: "business" },
  { key: "bulk_actions", label: "Bulk move, delete and void", plan: "business" },
  { key: "teams_and_groups", label: "Teams and groups", plan: "business" },
  { key: "email_branding", label: "Your branding on recipient emails", plan: "business" },
  { key: "signer_passcode", label: "Signer passcodes", plan: "business" },
  { key: "remove_signet_branding", label: "Remove Signet branding", plan: "premium" },
  { key: "pdf_vault", label: "PDF encryption vault", plan: "premium" },
  { key: "own_storage", label: "Bring your own storage", plan: "enterprise" },
];

const planName = (id: string) => (id === "free" ? "Free" : getPlan(id)?.name ?? id);

function Meter({ icon: Icon, title, used, limit, detail }: { icon: typeof Send; title: string; used: number; limit: number | null; detail: string }) {
  const share = limit ? Math.min(1, used / limit) : 0;
  const full = limit !== null && used >= limit;
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2.5 text-sm font-semibold"><span className="grid size-8 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300"><Icon className="size-4" /></span>{title}</div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
        {used}
        <span className="text-base font-normal text-muted-foreground">{limit === null ? "" : ` of ${limit}`}</span>
      </p>
      {limit !== null ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className={cn("h-full rounded-full", full ? "bg-amber-500" : "bg-primary")} style={{ width: `${Math.max(share * 100, used ? 3 : 0)}%` }} />
        </div>
      ) : null}
      <p className={cn("mt-2 text-xs", full ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{detail}</p>
    </section>
  );
}

export default function UsagePage() {
  const entitlements = useEntitlements();
  const e = entitlements.data;
  const monthName = new Intl.DateTimeFormat(undefined, { month: "long", timeZone: "UTC" }).format(new Date());

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        eyebrow="Organisation settings"
        title="Usage"
        description={e ? `What the ${planName(e.plan)} plan includes, and how much of it this workspace uses.` : "What your plan includes, and how much of it this workspace uses."}
        actions={<Button asChild variant="outline"><Link href="/settings/billing">Billing &amp; plan</Link></Button>}
      />

      {entitlements.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading usage…</p>
      ) : entitlements.error || !e ? (
        <p role="alert" className="text-sm text-destructive">{entitlements.error instanceof Error ? entitlements.error.message : "Couldn't load usage."}</p>
      ) : (
        <>
          {!e.enforced ? (
            <p className="rounded-2xl border border-blue-500/15 bg-blue-500/5 px-4 py-3 text-sm text-muted-foreground">Plan limits aren&apos;t switched on for this workspace yet, so nothing below is blocked.</p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Meter
              icon={Send}
              title={`Envelopes sent in ${monthName}`}
              used={e.sentThisMonth}
              limit={e.monthlySendLimit}
              detail={e.monthlySendLimit === null ? "Your plan has no monthly sending limit." : e.sentThisMonth >= e.monthlySendLimit ? "You've reached this month's limit. Upgrade to keep sending." : `Resets on the 1st (UTC). Paid plans have no limit.`}
            />
            <Meter
              icon={Users}
              title="Sender seats"
              used={e.seatsUsed}
              limit={e.seats}
              detail={`${e.pendingSeats ? `${e.pendingSeats} pending ${e.pendingSeats === 1 ? "invitation" : "invitations"} will also take a seat. ` : ""}Viewers don't use a seat.`}
            />
          </div>

          <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <div className="border-b px-5 py-4 sm:px-6">
              <h2 className="text-sm font-semibold">Features</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Included in your plan, or the plan that adds them.</p>
            </div>
            <ul className="divide-y">
              {FEATURES.map((feature) => {
                const included = e.features[feature.key] ?? false;
                return (
                  <li key={feature.key} className="flex items-center gap-3 px-5 py-3 text-sm sm:px-6">
                    {included ? <Check className="size-4 shrink-0 text-emerald-600" /> : <Lock className="size-4 shrink-0 text-muted-foreground/60" />}
                    <span className={cn("flex-1", !included && "text-muted-foreground")}>{feature.label}</span>
                    {included ? <span className="text-xs text-muted-foreground">Included</span> : <Link href={feature.plan === "enterprise" ? "/pricing" : `/checkout/${feature.plan}`} className="text-xs font-semibold text-primary hover:underline">{planName(feature.plan)} and up</Link>}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
