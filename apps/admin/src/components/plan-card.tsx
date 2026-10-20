import { CreditCard, Pencil, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@signet/ui/components/button";
import { Input } from "@signet/ui/components/input";
import { Label } from "@signet/ui/components/label";
import { cn } from "@signet/ui/lib/utils";

import { ActionDialog, type ActionSpec } from "@/components/action-dialog";
import { useCan } from "@/lib/admin-context";
import { Badge, Card, PlanBadge } from "@/components/page";
import { usePlanPrices } from "@/lib/api";
import { formatDate, formatMoney, formatNumber, planLabels, subscriptionStatusLabels } from "@/lib/format";
import type { PlanId, PlanPrice, Subscription, SubscriptionStatus, WorkspaceDetail } from "@/lib/types";

const plans: PlanId[] = ["free", "starter", "business", "premium", "enterprise"];
const statuses: SubscriptionStatus[] = ["active", "trialing", "past_due", "canceled"];

const statusTone = { active: "success", trialing: "info", past_due: "warning", canceled: "neutral" } as const;

/** Segmented buttons for a short list of options. */
function Choice<T extends string>({ label, value, options, onChange, labels }: { label: string; value: T | null; options: readonly T[]; onChange: (value: T) => void; labels: Record<string, string> }) {
  return (
    <div className="grid content-start gap-2">
      <Label>{label}</Label>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(option)}
            className={cn("h-8 rounded-lg border px-3 text-sm font-medium transition-colors", value === option ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            {labels[option] ?? option}
          </button>
        ))}
      </div>
    </div>
  );
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

type PriceMode = "keep" | "list" | "custom";

type Draft = { plan: PlanId; seats: string; cycle: "monthly" | "annual"; status: SubscriptionStatus; endsOn: string; note: string; priceMode: PriceMode; customPrice: string };

function draftFrom(sub: Subscription): Draft {
  return {
    plan: sub.plan,
    seats: String(Math.max(sub.seats, sub.plan === "free" ? sub.seatsUsed : sub.seats)),
    cycle: sub.billingCycle ?? "annual",
    status: sub.status,
    endsOn: toDateInput(sub.periodEndsAt),
    note: sub.note ?? "",
    priceMode: "keep",
    customPrice: sub.seatPriceCents === null ? "" : (sub.seatPriceCents / 100).toFixed(sub.seatPriceCents % 100 ? 2 : 0),
  };
}

/** The per-seat list price for a plan and billing cycle, or null for "contact sales". */
const listPriceFor = (prices: PlanPrice[] | undefined, plan: PlanId, cycle: "monthly" | "annual") => {
  const price = prices?.find((p) => p.plan === plan);
  return price ? (cycle === "annual" ? price.annualCents : price.monthlyCents) : null;
};

const centsFrom = (dollars: string) => {
  const value = Number(dollars.trim());
  return dollars.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= 100_000 ? Math.round(value * 100) : null;
};

/** What a subscription costs per billing period. */
function periodTotal(cents: number, seats: number, cycle: "monthly" | "annual" | null) {
  return cycle === "annual" ? `${formatMoney(cents * seats * 12)} a year` : `${formatMoney(cents * seats)} a month`;
}

function planSpec(w: WorkspaceDetail, draft: Draft, setDraft: (next: Draft) => void, prices: PlanPrice[] | undefined): ActionSpec<Subscription> {
  const paid = draft.plan !== "free";
  const seats = Number(draft.seats);
  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const sub = w.subscription;
  // Keeping the current price only makes sense while the plan and billing cycle stay the same.
  const canKeep = sub.plan === draft.plan && sub.billingCycle === draft.cycle && sub.seatPriceCents !== null;
  const mode: PriceMode = draft.priceMode === "keep" && !canKeep ? "list" : draft.priceMode;
  const list = listPriceFor(prices, draft.plan, draft.cycle);
  const custom = centsFrom(draft.customPrice);
  const seatPrice = mode === "keep" ? sub.seatPriceCents : mode === "list" ? list : custom;
  const priceOptions: PriceMode[] = canKeep ? ["keep", "list", "custom"] : ["list", "custom"];
  const priceLabels = {
    keep: `Keep ${sub.seatPriceCents === null ? "" : formatMoney(sub.seatPriceCents)}`,
    list: list === null ? "List price (none)" : `List price ${formatMoney(list)}`,
    custom: "Custom",
  };
  return {
    title: `Change ${w.name}'s plan`,
    description: "Plans are set by hand until a payment provider is connected. The customer sees the plan and price on their Billing page. Seats, Free's 3 sends a month and plan features are enforced where the plan-enforcement feature flag is on.",
    confirmLabel: "Save plan",
    reasonPlaceholder: "e.g. Paid by bank transfer, invoice INV-0042",
    ready: !paid || (Number.isInteger(seats) && seats >= 1 && (draft.status !== "trialing" || Boolean(draft.endsOn)) && (mode !== "custom" || custom !== null)),
    fields: (
      <>
        <Choice label="Plan" value={draft.plan} options={plans} onChange={(plan) => update({ plan })} labels={planLabels} />
        {paid ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="plan-seats">Seats</Label>
                <Input id="plan-seats" type="number" min={1} max={10000} value={draft.seats} onChange={(event) => update({ seats: event.target.value })} />
                <p className="text-xs text-muted-foreground">{w.subscription.seatsUsed} in use now</p>
              </div>
              <Choice label="Billing" value={draft.cycle} options={["monthly", "annual"] as const} onChange={(cycle) => update({ cycle })} labels={{ monthly: "Monthly", annual: "Annual" }} />
            </div>
            <div className="grid gap-2">
              <Choice label="Price per seat / month" value={mode} options={priceOptions} onChange={(priceMode) => update({ priceMode })} labels={priceLabels} />
              {mode === "custom" ? (
                <div className="relative max-w-40">
                  <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input aria-label="Custom price per seat" inputMode="decimal" value={draft.customPrice} onChange={(event) => update({ customPrice: event.target.value })} className="ps-7 tabular-nums" placeholder="0.00" />
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {seatPrice === null
                  ? "No price: this workspace counts as $0 in revenue until one is set."
                  : `${periodTotal(seatPrice, Number.isInteger(seats) && seats > 0 ? seats : 1, draft.cycle)}. Later list-price changes won't change it.`}
              </p>
            </div>
            <Choice label="Status" value={draft.status} options={statuses} onChange={(status) => update({ status })} labels={subscriptionStatusLabels} />
            <div className="grid gap-2">
              <Label htmlFor="plan-ends">{draft.status === "trialing" ? "Trial ends" : draft.status === "canceled" ? "Access ends" : "Renews"}</Label>
              <Input id="plan-ends" type="date" value={draft.endsOn} onChange={(event) => update({ endsOn: event.target.value })} required={draft.status === "trialing"} />
            </div>
          </>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="plan-note">Internal note (optional)</Label>
          <Input id="plan-note" value={draft.note} onChange={(event) => update({ note: event.target.value })} maxLength={500} placeholder="Contract or invoice reference" />
        </div>
      </>
    ),
    request: (reason) => ({
      method: "PUT",
      path: `/workspaces/${encodeURIComponent(w.id)}/subscription`,
      body: {
        plan: draft.plan,
        seats: paid ? seats : 1,
        billingCycle: paid ? draft.cycle : null,
        status: paid ? draft.status : "active",
        // The chosen day ends at 23:59 local time.
        periodEndsAt: paid && draft.endsOn ? new Date(`${draft.endsOn}T23:59:00`).toISOString() : null,
        priceMode: mode,
        seatPriceCents: mode === "custom" ? custom : null,
        note: draft.note,
        reason,
      },
    }),
    success: (sub) => `${w.name} is now on ${planLabels[sub.plan]}.`,
  };
}

export function PlanCard({ workspace: w, onDone }: { workspace: WorkspaceDetail; onDone: (message: string) => void }) {
  const canManage = useCan("super_admin");
  const prices = usePlanPrices();
  const [draft, setDraft] = useState<Draft | null>(null);
  const sub = w.subscription;
  const paid = sub.plan !== "free";
  const over = paid && sub.seatsUsed > sub.seats;
  const percent = paid ? Math.min(100, Math.round((sub.seatsUsed / sub.seats) * 100)) : 0;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <CreditCard className="size-4 text-muted-foreground" /> Plan
        </h2>
        {canManage && !sub.managedByStripe ? (
          <Button variant="ghost" size="sm" onClick={() => setDraft(draftFrom(sub))}>
            <Pencil /> Change
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PlanBadge plan={sub.plan} />
        {paid ? <Badge tone={statusTone[sub.status]}>{subscriptionStatusLabels[sub.status]}</Badge> : null}
        {paid && sub.billingCycle ? <span className="text-xs text-muted-foreground">Billed {sub.billingCycle === "annual" ? "annually" : "monthly"}</span> : null}
        {sub.managedByStripe ? <Badge tone="info">Pays through Stripe</Badge> : null}
      </div>
      {sub.managedByStripe ? <p className="mt-2 text-xs text-muted-foreground">The plan, seats and status follow Stripe. Change or cancel them in the Stripe dashboard.</p> : null}

      {paid ? (
        <p className="mt-3 text-sm">
          {sub.seatPriceCents === null ? (
            <span className="text-amber-700 dark:text-amber-300">No price set · counts as $0</span>
          ) : (
            <>
              <span className="font-semibold tabular-nums">{formatMoney(sub.seatPriceCents)}</span>
              <span className="text-muted-foreground"> / seat / mo · {periodTotal(sub.seatPriceCents, sub.seats, sub.billingCycle)}</span>
            </>
          )}
        </p>
      ) : null}

      {paid ? (
        <>
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Seats</span>
              <span className={cn("font-medium tabular-nums", over && "text-amber-700 dark:text-amber-300")}>
                {formatNumber(sub.seatsUsed)} of {formatNumber(sub.seats)} used
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className={cn("h-full rounded-full", over ? "bg-amber-500" : "bg-primary")} style={{ width: `${percent}%` }} />
            </div>
            {over ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <TriangleAlert className="mt-px size-3.5 shrink-0" /> {sub.seatsUsed - sub.seats} more {sub.seatsUsed - sub.seats === 1 ? "member" : "members"} than seats. Adding more is blocked where plan enforcement is on.
              </p>
            ) : null}
          </div>
          {sub.periodEndsAt ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {sub.status === "trialing" ? "Trial ends" : sub.status === "canceled" ? "Access ends" : "Renews"} {formatDate(sub.periodEndsAt)}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No paid plan. {formatNumber(sub.seatsUsed)} {sub.seatsUsed === 1 ? "member sends" : "members send"} on Free.</p>
      )}
      {sub.note ? <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{sub.note}</p> : null}

      <ActionDialog spec={draft ? (planSpec(w, draft, setDraft, prices.data) as ActionSpec<never>) : null} onClose={() => setDraft(null)} onDone={onDone} />
    </Card>
  );
}
