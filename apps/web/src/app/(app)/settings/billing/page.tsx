"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowRight, Check, CheckCircle2, CreditCard, FileText, Loader2, Sparkles, TriangleAlert, Users } from "lucide-react";

import { useLivePlans } from "@/components/marketing/plans-context";
import { InvoiceList, ManageBillingButton, PaymentMethod, useBillingDetailsState } from "@/components/settings/billing-parts";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useMe, useMembers, useSubscription } from "@/hooks/use-envelope-api";
import { formatMoney } from "@/lib/plans";

// Paid plans are bought through Stripe. Stripe's webhooks update the plan here, so right after checkout
// the page waits a few seconds for the webhook before showing the new plan.

const PLAN_ORDER = ["free", "starter", "business", "premium", "enterprise"];

const STATUS: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  trialing: { label: "Trial", className: "bg-primary/10 text-primary" },
  past_due: { label: "Payment due", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  canceled: { label: "Canceled", className: "bg-muted text-muted-foreground" },
};

const longDate = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" });

function Panel({ icon: Icon, title, description, actions, children }: { icon: typeof CreditCard; title: string; description: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"><Icon className="size-4" /></span><div className="flex-1"><h2 className="text-sm font-semibold">{title}</h2><p className="mt-0.5 text-sm text-muted-foreground">{description}</p></div>{actions}</div><div className="mt-5">{children}</div></section>;
}

export default function BillingPage() {
  return (
    <Suspense>
      <Billing />
    </Suspense>
  );
}

function Billing() {
  const params = useSearchParams();
  const checkoutState = params.get("checkout");
  const me = useMe();
  const members = useMembers();
  const memberCount = members.data?.length;
  const subscription = useSubscription();
  const billing = useBillingDetailsState();
  const plans = useLivePlans();
  const sub = subscription.data;
  const planId = sub?.plan ?? "free";
  const paid = planId !== "free";
  const managed = Boolean(sub?.managedByStripe);
  const canManage = me.data?.workspace.role === "owner" || me.data?.workspace.role === "admin";
  const billingEnabled = billing.details?.enabled ?? false;
  const current = plans.find((plan) => plan.id === planId);
  const status = STATUS[sub?.status ?? "active"] ?? STATUS.active;
  const upgrades = plans.filter((plan) => plan.price && PLAN_ORDER.indexOf(plan.id) > PLAN_ORDER.indexOf(planId));
  const periodLabel = sub?.status === "trialing" ? "Trial ends" : sub?.cancelAtPeriodEnd || sub?.status === "canceled" ? "Access ends" : "Next billing date";
  const cycle = sub?.billingCycle ?? "annual";
  const seats = Math.max(sub?.seats ?? 1, sub?.seatsUsed ?? 1);
  const checkoutHref = (plan: string) => `/checkout/${plan}?cycle=${cycle}&seats=${seats}`;

  // After Stripe Checkout, wait for the webhook to switch the plan (checking every 2 seconds, up to a minute).
  const [waited, setWaited] = useState(0);
  const waiting = checkoutState === "success" && !managed && waited < 30;
  const { refetch } = subscription;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      void refetch();
      setWaited((count) => count + 1);
    }, 2000);
    return () => clearTimeout(timer);
  }, [waiting, waited, refetch]);

  return <div className="space-y-6 pb-10">
    <PageHeader
      eyebrow="Organisation settings"
      title="Billing & plan"
      description="Your subscription, seats, payment method and invoices."
      actions={<div className="flex flex-wrap items-start gap-2"><Button asChild variant="outline"><Link href="/pricing">Compare plans</Link></Button>{managed && canManage ? <ManageBillingButton /> : null}</div>}
    />

    {checkoutState === "success" ? (
      managed ? (
        <p role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm font-medium"><CheckCircle2 className="size-4 shrink-0 text-emerald-600" />Payment received. You&apos;re on {current?.name ?? "your new plan"}.</p>
      ) : waiting ? (
        <p role="status" className="flex items-center gap-2 rounded-2xl border bg-muted/50 px-4 py-3 text-sm"><Loader2 className="size-4 shrink-0 animate-spin" />Payment received. Activating your plan…</p>
      ) : (
        <p role="status" className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />Your payment went through, but the plan hasn&apos;t switched yet. It usually does within a minute; refresh this page, or contact support if it doesn&apos;t.</p>
      )
    ) : null}
    {checkoutState === "updated" ? (
      <p role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm font-medium"><CheckCircle2 className="size-4 shrink-0 text-emerald-600" />Your plan was updated. The difference is prorated on your next invoice.</p>
    ) : null}
    {sub?.status === "past_due" && managed ? (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="flex items-start gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />Your last payment didn&apos;t go through. Update your card to keep your plan.</p>{canManage ? <ManageBillingButton label="Update payment" variant="default" /> : null}</div>
    ) : null}

    <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Current plan</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>{status.label}</span></div><p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{subscription.isLoading ? "…" : current?.name ?? "Free"}</p><p className="mt-1 text-sm text-muted-foreground">{paid ? current?.audience : "Sign documents you receive and try sending. Upgrade to add sender seats and team features."}</p></div>
        {canManage && billingEnabled ? (
          managed && current?.price ? <Button asChild size="lg" variant="outline"><Link href={checkoutHref(planId)}>Change plan or seats</Link></Button>
            : upgrades.length && !paid ? <Button asChild size="lg"><Link href={checkoutHref(upgrades[0].id)}><Sparkles /> Upgrade plan</Link></Button> : null
        ) : null}
      </div>
      {sub?.cancelAtPeriodEnd && sub.periodEndsAt ? (
        <p className="border-t bg-amber-500/5 px-6 py-3 text-sm">Your plan is canceled and ends on {longDate.format(new Date(sub.periodEndsAt))}. After that the workspace moves to Free.{canManage ? " You can keep it from Manage billing." : ""}</p>
      ) : null}
      <dl className="grid grid-cols-2 divide-x border-t bg-surface-subtle/60 sm:grid-cols-4">
        <div className="p-5"><dt className="text-xs text-muted-foreground">Billing cycle</dt><dd className="mt-1 text-sm font-semibold">{sub?.billingCycle === "annual" ? "Annual" : sub?.billingCycle === "monthly" ? "Monthly" : "—"}</dd></div>
        <div className="p-5"><dt className="text-xs text-muted-foreground">Your price</dt><dd className="mt-1 text-sm font-semibold">{paid && sub?.seatPriceCents != null ? <>{formatMoney(sub.seatPriceCents / 100)}<span className="font-normal text-muted-foreground"> / seat / mo</span></> : "—"}</dd></div>
        <div className="border-t p-5 sm:border-t-0"><dt className="text-xs text-muted-foreground">{periodLabel}</dt><dd className="mt-1 text-sm font-semibold">{sub?.periodEndsAt ? longDate.format(new Date(sub.periodEndsAt)) : "—"}</dd></div>
        <div className="border-t p-5 sm:border-t-0"><dt className="text-xs text-muted-foreground">Workspace members</dt><dd className="mt-1 text-sm font-semibold">{members.isLoading ? "…" : memberCount ?? "—"}</dd></div>
      </dl>
    </section>

    {upgrades.length && billingEnabled && canManage ? <section>
      <h2 className="text-sm font-semibold">{paid ? "Move up a plan" : "Upgrade options"}</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3">{upgrades.map((plan) => <article key={plan.id} className={`flex flex-col rounded-2xl border bg-card p-5 ${plan.highlight ? "border-primary ring-1 ring-primary" : ""}`}>
        <div className="flex items-center justify-between"><p className="font-semibold">{plan.name}</p>{plan.highlight ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{plan.highlight}</span> : null}</div>
        <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{formatMoney(plan.price![cycle])}<span className="text-xs font-normal text-muted-foreground"> / seat / mo, billed {cycle === "annual" ? "annually" : "monthly"}</span></p>
        <ul className="mt-4 flex-1 space-y-2">{plan.features.slice(0, 3).map((feature) => <li key={feature} className="flex gap-2 text-xs text-muted-foreground"><Check className="size-3.5 shrink-0 text-emerald-600" />{feature}</li>)}</ul>
        <Button asChild variant={plan.highlight ? "default" : "outline"} className="mt-5"><Link href={checkoutHref(plan.id)}>{plan.cta} <ArrowRight /></Link></Button>
      </article>)}</div>
    </section> : null}

    <div className="grid gap-6 lg:grid-cols-2">
      <Panel icon={Users} title="Seats" description="Seats are for members who prepare and send documents.">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-subtle/70 p-4"><div><p className="text-sm font-semibold">{paid && sub ? `${sub.seatsUsed} of ${sub.seats} seats used` : `${memberCount ?? "—"} ${memberCount === 1 ? "member" : "members"}`}</p><p className="text-xs text-muted-foreground">{paid ? (managed ? "Viewers don't use a seat. Added seats are prorated." : "Viewers don't use a seat. Contact us to add seats.") : "Paid seats become available after you upgrade."}</p></div>{managed && canManage && current?.price ? <Button asChild variant="outline" size="sm"><Link href={checkoutHref(planId)}>Change seats</Link></Button> : <Button asChild variant="outline" size="sm"><Link href="/members">Manage members</Link></Button>}</div>
      </Panel>
      <Panel icon={CreditCard} title="Payment method" description="Cards are stored securely by Stripe." actions={managed && canManage && billing.details?.paymentMethod ? <ManageBillingButton label="Update" /> : null}>
        <PaymentMethod details={billing.details} loading={billing.loading} />
      </Panel>
    </div>

    <Panel icon={FileText} title="Invoices" description="Receipts for every charge on this workspace.">
      <InvoiceList details={billing.details} loading={billing.loading} error={billing.error} />
    </Panel>
  </div>;
}
