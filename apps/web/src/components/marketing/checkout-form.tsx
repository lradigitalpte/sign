"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Info, LockKeyhole, Minus, Plus, ShieldCheck, UserRound } from "lucide-react";

import { usePlans } from "@/components/marketing/plans-context";
import { CycleToggle } from "@/components/marketing/pricing-plans";
import { MAX_ONLINE_SEATS, annualSavings, cycleTotal, formatMoney, getPlan, seatPrice, type BillingCycle, type PlanId } from "@/lib/plans";

function Step({ number, title, description, children }: { number: number; title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-3xl border border-border bg-card p-5 sm:p-7">
    <div className="flex items-start gap-4"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{number}</span><div><h2 className="text-lg font-bold tracking-[-0.02em]">{title}</h2>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div></div>
    <div className="mt-6">{children}</div>
  </section>;
}

/**
 * Plan, billing cycle and seats. Continuing goes to /settings/billing/checkout, which signs the buyer in
 * (or up) first, then sends them to Stripe Checkout for card and billing details.
 */
export function CheckoutForm({ initialPlan, initialCycle, initialSeats = 1, canceled = false }: { initialPlan: PlanId; initialCycle: BillingCycle; initialSeats?: number; canceled?: boolean }) {
  const router = useRouter();
  const [planId, setPlanId] = useState<PlanId>(initialPlan);
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [seats, setSeats] = useState(initialSeats);
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const plans = usePlans();
  const plan = getPlan(planId, plans)!;
  const termsError = submitted && !agreed ? "Agree to the Terms of Service to continue." : null;
  const total = cycleTotal(plan, cycle, seats);
  const savings = cycle === "annual" ? annualSavings(plan, seats) : 0;
  const purchasable = plans.filter((item) => item.price);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!agreed) return;
    router.push(`/settings/billing/checkout?${new URLSearchParams({ plan: planId, cycle, seats: String(seats) })}`);
  }

  return <form noValidate onSubmit={submit} className="site-container grid gap-8 pb-16 lg:grid-cols-[1fr_420px] lg:gap-12 lg:pb-24">
    <div className="space-y-5">
      <div><Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to plans</Link><h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Complete your purchase</h1><p className="mt-2 text-sm text-muted-foreground">Set up your plan in a couple of minutes. You can add seats or change plans at any time.</p></div>
      {canceled ? <p role="status" className="flex items-start gap-2 rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" />Payment was canceled and nothing was charged. Pick up where you left off whenever you&apos;re ready.</p> : null}

      <Step number={1} title="Choose your plan" description="Seats are for people who send documents. Signers never need one.">
        <div role="radiogroup" aria-label="Plan" className="grid gap-3 sm:grid-cols-3">{purchasable.map((item) => <button key={item.id} type="button" role="radio" aria-checked={planId === item.id} onClick={() => setPlanId(item.id)} className={`rounded-xl border p-4 text-left transition ${planId === item.id ? "border-primary bg-(--site-tint) ring-1 ring-primary" : "border-border hover:border-border"}`}><span className="flex items-center justify-between text-sm font-bold">{item.name}{planId === item.id ? <Check className="size-4 text-(--site-accent)" /> : null}</span><span className="mt-1 block text-xs text-muted-foreground">{formatMoney(seatPrice(item, cycle))} / seat / mo</span></button>)}</div>
        <div className="mt-6 flex flex-col gap-6 border-t border-border pt-6 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="mb-2 text-sm font-medium">Billing cycle</p><CycleToggle cycle={cycle} onChange={setCycle} /></div>
          <div><p id="seats-label" className="mb-2 text-sm font-medium">Number of seats</p><div className="inline-flex items-center rounded-xl border border-border bg-card p-1" aria-labelledby="seats-label"><button type="button" aria-label="Remove a seat" disabled={seats <= 1} onClick={() => setSeats(seats - 1)} className="grid size-9 place-items-center rounded-lg text-foreground transition hover:bg-muted disabled:opacity-35"><Minus className="size-4" /></button><output aria-live="polite" className="w-12 text-center text-base font-bold tabular-nums">{seats}</output><button type="button" aria-label="Add a seat" disabled={seats >= MAX_ONLINE_SEATS} onClick={() => setSeats(seats + 1)} className="grid size-9 place-items-center rounded-lg text-foreground transition hover:bg-muted disabled:opacity-35"><Plus className="size-4" /></button></div></div>
        </div>
        {seats >= MAX_ONLINE_SEATS ? <p className="mt-4 rounded-xl bg-[#fff5d9] px-4 py-3 text-sm text-[#7a5600]">Online checkout supports up to {MAX_ONLINE_SEATS} seats. <a href="mailto:hello@send.frogmentec.ae?subject=Signet%20volume%20pricing" className="font-bold underline underline-offset-2">Contact sales</a> for volume pricing.</p> : null}
      </Step>

      <Step number={2} title="Account & payment" description="Your plan belongs to a Signet workspace.">
        <ul className="space-y-4 text-sm leading-6 text-muted-foreground">
          <li className="flex gap-3"><UserRound className="mt-0.5 size-4 shrink-0 text-(--site-accent)" /><span><span className="font-semibold text-foreground">Sign in or create your account.</span> The plan goes on the workspace you&apos;re signed in to. Only workspace owners and admins can buy.</span></li>
          <li className="flex gap-3"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-(--site-accent)" /><span><span className="font-semibold text-foreground">Pay on Stripe&apos;s secure page.</span> You&apos;ll enter your card, billing address and tax ID there. Signet never sees your full card number.</span></li>
        </ul>
      </Step>
    </div>

    <aside className="lg:sticky lg:top-28 lg:self-start">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-[0_24px_60px_-40px_rgba(16,42,67,.5)]">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Purchase summary</p>
        <div className="mt-4 flex items-start justify-between gap-4"><div><p className="text-lg font-bold">{plan.name}</p><p className="text-xs text-muted-foreground">{cycle === "annual" ? "Billed annually" : "Billed monthly"}</p></div><Link href="/pricing#compare" className="text-xs font-semibold text-(--site-accent)">Compare</Link></div>
        <dl className="mt-5 space-y-3 border-t border-border pt-5 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{seats} {seats === 1 ? "seat" : "seats"} × {formatMoney(seatPrice(plan, cycle))}{cycle === "annual" ? " × 12 mo" : ""}</dt><dd className="font-semibold tabular-nums">{formatMoney(total)}</dd></div>
          {savings ? <div className="flex justify-between gap-4 text-(--site-accent)"><dt>Annual savings</dt><dd className="font-semibold tabular-nums">−{formatMoney(savings)}</dd></div> : null}
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Taxes</dt><dd className="text-muted-foreground">Calculated at payment</dd></div>
        </dl>
        <div className="mt-5 flex items-end justify-between border-t border-border pt-5"><p className="text-sm font-bold">Total due today</p><p className="text-2xl font-semibold tracking-[-0.04em] tabular-nums">{formatMoney(total)}</p></div>
        <p className="mt-1 text-right text-xs text-muted-foreground">Before any taxes · renews {cycle === "annual" ? "yearly" : "monthly"}</p>
        <label className="mt-6 flex items-start gap-3 text-xs leading-5 text-muted-foreground"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-(--site-accent)" aria-invalid={Boolean(termsError)} /><span>I agree to the <Link href="/terms" className="font-semibold text-foreground underline underline-offset-2">Terms of Service</Link> and <Link href="/privacy" className="font-semibold text-foreground underline underline-offset-2">Privacy Notice</Link>, and authorize recurring charges until I cancel.</span></label>
        {termsError ? <p role="alert" className="mt-2 text-xs font-medium text-destructive">{termsError}</p> : null}
        <button type="submit" className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground transition hover:bg-primary/90">Continue to secure payment <ArrowRight className="size-4" /></button>
      </div>
      <ul className="mt-5 space-y-2.5 px-1 text-xs text-muted-foreground">{["Cancel renewal anytime", "Add seats later, prorated to your billing date", "Recipients always sign for free"].map((item) => <li key={item} className="flex gap-2"><ShieldCheck className="size-4 shrink-0 text-(--site-accent)" />{item}</li>)}</ul>
    </aside>
  </form>;
}
