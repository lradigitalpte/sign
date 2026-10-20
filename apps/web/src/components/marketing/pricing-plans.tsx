"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Clock,
  LockKeyhole,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import { usePlans } from "@/components/marketing/plans-context";
import { CheckDot, Eyebrow, HeroBackdrop, Highlight } from "@/components/marketing/public-layout";
import {
  COMPARISON,
  MAX_ONLINE_SEATS,
  ROADMAP,
  annualSavings,
  cycleTotal,
  formatMoney,
  maxAnnualDiscount,
  type BillingCycle,
  type Plan,
  type PlanId,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

const PLAN_ICONS: Record<PlanId, LucideIcon> = {
  starter: UserRound,
  business: Users,
  premium: LockKeyhole,
  enterprise: Building2,
};

/** Number of comparison groups shown before "Show all features" */
const COLLAPSED_GROUPS = 2;

export function CycleToggle({ cycle, onChange, dark = false }: { cycle: BillingCycle; onChange: (cycle: BillingCycle) => void; dark?: boolean }) {
  const plans = usePlans();
  const base = dark ? "border-white/15 bg-white/10" : "border-border bg-muted/50";
  return (
    <div role="radiogroup" aria-label="Billing cycle" className={cn("inline-flex rounded-full border p-1", base)}>
      {(["monthly", "annual"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={cycle === value}
          onClick={() => onChange(value)}
          className={cn(
            "flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold transition",
            dark
              ? cycle === value
                ? "bg-(--site-accent) text-white shadow-lg shadow-(--site-accent)/30"
                : "text-white/70 hover:text-white"
              : cycle === value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === "monthly" ? "Monthly" : "Annually"}
          {value === "annual" ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px]",
                dark
                  ? cycle === value
                    ? "bg-white/20 text-white"
                    : "bg-(--site-accent)/25 text-(--site-accent-soft)"
                  : cycle === value
                    ? "bg-primary-foreground/15 text-primary-foreground"
                    : "bg-(--site-tint) text-(--site-accent)",
              )}
            >
              Save up to {maxAnnualDiscount(plans)}%
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function checkoutHref(plan: Plan, cycle: BillingCycle, seats?: number) {
  if (!plan.price) return "mailto:hello@send.frogmentec.ae?subject=Signet%20Enterprise";
  return `/checkout/${plan.id}?cycle=${cycle}${seats && seats > 1 ? `&seats=${seats}` : ""}`;
}

function discountPercent(plan: Plan) {
  return plan.price && plan.price.monthly > 0 ? Math.round((1 - plan.price.annual / plan.price.monthly) * 100) : 0;
}

function PlanCard({ plan, cycle }: { plan: Plan; cycle: BillingCycle }) {
  const featured = Boolean(plan.highlight);
  const Icon = PLAN_ICONS[plan.id];
  return (
    <article
      className={cn(
        "relative flex flex-col rounded-[1.75rem] p-7",
        featured
          ? "bg-(--site-ink) text-white shadow-2xl shadow-(--site-accent)/30 ring-2 ring-(--site-accent) xl:-mt-4 xl:mb-4"
          : "bg-card text-card-foreground shadow-xl shadow-(--site-ink)/5 ring-1 ring-border",
      )}
    >
      {featured ? (
        <>
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]" aria-hidden>
            <div className="absolute -end-16 -top-16 size-56 rounded-full bg-(--site-accent)/35 blur-3xl" />
          </div>
          <span className="absolute -top-3.5 start-7 inline-flex items-center gap-1 rounded-full bg-(--site-accent) px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg shadow-(--site-accent)/40">
            <Sparkles className="size-3" />
            {plan.highlight}
          </span>
        </>
      ) : null}

      <div className="relative flex items-center gap-3">
        <span className={cn("grid size-11 place-items-center rounded-2xl", featured ? "bg-(--site-accent) text-white" : "bg-(--site-tint) text-(--site-accent)")}>
          <Icon className="size-5" />
        </span>
        <h3 className="text-xl font-semibold tracking-tight">{plan.name}</h3>
      </div>
      <p className={cn("relative mt-4 min-h-12 text-sm leading-6", featured ? "text-white/65" : "text-muted-foreground")}>{plan.audience}</p>

      <div className="relative mt-6 min-h-24">
        {plan.price ? (
          <div key={cycle} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
            <p className="flex items-end gap-1.5">
              <span className="text-5xl font-semibold tracking-tight">{formatMoney(plan.price[cycle])}</span>
              <span className={cn("pb-2 text-sm", featured ? "text-white/60" : "text-muted-foreground")}>/ seat / mo</span>
            </p>
            {cycle === "annual" ? (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className={featured ? "text-white/55" : "text-muted-foreground"}>
                  Billed annually · <s>{formatMoney(plan.price.monthly)}</s>
                </span>
                <span className={cn("rounded-full px-2 py-0.5 font-semibold", featured ? "bg-white/15 text-white" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300")}>
                  Save {discountPercent(plan)}%
                </span>
              </p>
            ) : (
              <p className={cn("mt-2 text-xs", featured ? "text-white/55" : "text-muted-foreground")}>Billed monthly · cancel renewal anytime</p>
            )}
          </div>
        ) : (
          <>
            <p className="text-5xl font-semibold tracking-tight">Custom</p>
            <p className="mt-2 text-xs text-muted-foreground">Volume pricing and annual contracts</p>
          </>
        )}
      </div>

      <Link
        href={checkoutHref(plan, cycle)}
        className={cn(
          "group relative mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold transition",
          featured
            ? "bg-(--site-accent) text-white shadow-lg shadow-(--site-accent)/30 hover:bg-(--site-accent-hover)"
            : "bg-(--site-tint) text-(--site-accent) hover:bg-(--site-accent) hover:text-white",
        )}
      >
        {plan.cta}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
      </Link>

      <div className={cn("relative my-7 h-px", featured ? "bg-white/10" : "bg-border")} />

      <p className={cn("relative text-xs font-semibold uppercase tracking-wider", featured ? "text-(--site-accent-soft)" : "text-muted-foreground")}>{plan.includesLabel}</p>
      <ul className="relative mt-4 space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm leading-5">
            <span className="mt-px">
              <CheckDot onDark={featured} />
            </span>
            {feature}
          </li>
        ))}
      </ul>
    </article>
  );
}

function SeatCalculator({ cycle, onCycleChange }: { cycle: BillingCycle; onCycleChange: (cycle: BillingCycle) => void }) {
  const purchasable = usePlans().filter((plan) => plan.price);
  const [planId, setPlanId] = useState<PlanId>("business");
  const [seats, setSeats] = useState(5);
  const plan = purchasable.find((item) => item.id === planId) ?? purchasable[0];
  const total = cycleTotal(plan, cycle, seats);
  const savings = cycle === "annual" ? annualSavings(plan, seats) : 0;
  const fill = ((seats - 1) / (MAX_ONLINE_SEATS - 1)) * 100;

  return (
    <section className="site-container pt-20 sm:pt-28">
      <div className="grid overflow-hidden rounded-[2rem] bg-card ring-1 ring-border lg:grid-cols-[1.25fr_1fr]">
        <div className="p-7 sm:p-12">
          <Eyebrow>Estimate your cost</Eyebrow>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">What will your team pay?</h2>
          <p className="mt-3 text-muted-foreground">Seats are for people who send. Everyone who only signs is free.</p>

          <div className="mt-9">
            <p className="text-sm font-semibold">Plan</p>
            <div role="radiogroup" aria-label="Plan" className="mt-3 grid grid-cols-3 gap-2">
              {purchasable.map((item) => {
                const Icon = PLAN_ICONS[item.id];
                const selected = item.id === planId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPlanId(item.id)}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-2xl p-4 text-start ring-1 transition",
                      selected ? "bg-(--site-tint) ring-2 ring-(--site-accent)" : "ring-border hover:bg-muted",
                    )}
                  >
                    <Icon className={cn("size-5", selected ? "text-(--site-accent)" : "text-muted-foreground")} />
                    <span className="text-sm font-semibold">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{formatMoney(item.price![cycle])} / seat / mo</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="seat-count" className="text-sm font-semibold">
                Seats
              </label>
              <div className="inline-flex items-center rounded-full bg-muted p-1 ring-1 ring-border">
                <button
                  type="button"
                  aria-label="Remove a seat"
                  disabled={seats <= 1}
                  onClick={() => setSeats(seats - 1)}
                  className="grid size-8 place-items-center rounded-full transition hover:bg-card disabled:opacity-35"
                >
                  <Minus className="size-4" />
                </button>
                <output htmlFor="seat-count" aria-live="polite" className="w-10 text-center text-base font-bold tabular-nums">
                  {seats}
                </output>
                <button
                  type="button"
                  aria-label="Add a seat"
                  disabled={seats >= MAX_ONLINE_SEATS}
                  onClick={() => setSeats(seats + 1)}
                  className="grid size-8 place-items-center rounded-full transition hover:bg-card disabled:opacity-35"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
            <input
              id="seat-count"
              type="range"
              min={1}
              max={MAX_ONLINE_SEATS}
              value={seats}
              onChange={(event) => setSeats(Number(event.target.value))}
              className="mt-5 h-2 w-full cursor-pointer appearance-none rounded-full accent-(--site-accent) [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-(--site-accent) [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-(--site-accent) [&::-webkit-slider-thumb]:shadow-md"
              style={{ background: `linear-gradient(to right, var(--site-accent) ${fill}%, var(--site-line) ${fill}%)` }}
            />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>1 seat</span>
              <span>{MAX_ONLINE_SEATS} seats</span>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm font-semibold">Billing</p>
            <CycleToggle cycle={cycle} onChange={onCycleChange} />
          </div>
        </div>

        <div className="relative flex flex-col justify-between overflow-hidden bg-(--site-ink) p-7 text-white sm:p-12">
          <HeroBackdrop />
          <div className="relative">
            <p className="text-sm font-medium text-white/60">
              {plan.name} · {seats} {seats === 1 ? "seat" : "seats"}
            </p>
            <p key={`${total}-${cycle}`} className="mt-3 flex items-end gap-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
              <span className="text-6xl font-semibold tracking-tight tabular-nums">{formatMoney(total)}</span>
              <span className="pb-2.5 text-white/60">/ {cycle === "annual" ? "year" : "month"}</span>
            </p>
            {cycle === "annual" ? (
              <p className="mt-2 text-sm text-white/60">That&apos;s {formatMoney(total / 12)} a month, billed yearly.</p>
            ) : (
              <p className="mt-2 text-sm text-white/60">Switch to annual billing to save {discountPercent(plan)}%.</p>
            )}
            {savings ? (
              <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1.5 text-sm font-semibold text-emerald-300">
                <Check className="size-4" />
                You save {formatMoney(savings)} a year
              </p>
            ) : null}
          </div>

          <div className="relative mt-10">
            <Link
              href={checkoutHref(plan, cycle, seats)}
              className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-(--site-accent) text-sm font-semibold text-white shadow-lg shadow-(--site-accent)/30 transition hover:bg-(--site-accent-hover)"
            >
              Continue with {plan.name}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
            </Link>
            <p className="mt-4 text-center text-xs text-white/50">
              Prices before tax.{" "}
              {seats >= MAX_ONLINE_SEATS ? (
                <a href="mailto:hello@send.frogmentec.ae?subject=Signet%20volume%20pricing" className="font-semibold text-white underline underline-offset-2">
                  Need more seats? Talk to sales.
                </a>
              ) : (
                "Add seats later, prorated to your billing date."
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Cell({ value, featured }: { value: boolean | string; featured: boolean }) {
  if (value === true)
    return (
      <span className={cn("mx-auto grid size-6 place-items-center rounded-full", featured ? "bg-(--site-accent) text-white" : "bg-(--site-tint) text-(--site-accent)")} aria-label="Included">
        <Check className="size-3.5" />
      </span>
    );
  if (value === false) return <Minus className="mx-auto size-4 text-muted-foreground/40" aria-label="Not included" />;
  return <span className="text-xs font-semibold">{value}</span>;
}

function ComparisonTable({ cycle, onCycleChange }: { cycle: BillingCycle; onCycleChange: (cycle: BillingCycle) => void }) {
  const [expanded, setExpanded] = useState(false);
  const groups = expanded ? COMPARISON : COMPARISON.slice(0, COLLAPSED_GROUPS);
  const hiddenRows = COMPARISON.slice(COLLAPSED_GROUPS).reduce((count, group) => count + group.rows.length, 0);
  const featuredColumn = (plan: Plan) => Boolean(plan.highlight);
  const plans = usePlans();

  return (
    <section id="compare" className="site-container scroll-mt-28 pt-20 sm:pt-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Compare plans</Eyebrow>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">Every feature, side by side</h2>
        </div>
        <CycleToggle cycle={cycle} onChange={onCycleChange} />
      </div>

      <div className="relative mt-10 overflow-x-auto rounded-[1.75rem] bg-card ring-1 ring-border lg:overflow-visible">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-[34%] rounded-tl-[1.75rem] border-b border-border bg-card/95 p-5 align-bottom backdrop-blur lg:sticky lg:top-24 lg:z-10">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Features</span>
              </th>
              {plans.map((plan, index) => (
                <th
                  key={plan.id}
                  scope="col"
                  className={cn(
                    "border-b border-border p-5 text-center align-bottom backdrop-blur lg:sticky lg:top-24 lg:z-10",
                    featuredColumn(plan) ? "bg-(--site-tint)/95" : "bg-card/95",
                    index === plans.length - 1 && "rounded-tr-[1.75rem]",
                  )}
                >
                  {plan.highlight ? <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-(--site-accent)">{plan.highlight}</span> : null}
                  <span className="block text-base font-semibold">{plan.name}</span>
                  <span className="mt-0.5 block text-xs font-medium text-muted-foreground">{plan.price ? `${formatMoney(plan.price[cycle])} / seat / mo` : "Custom"}</span>
                  <Link
                    href={checkoutHref(plan, cycle)}
                    className={cn(
                      "mt-3 inline-flex h-8 items-center rounded-full px-3.5 text-xs font-semibold transition",
                      featuredColumn(plan) ? "bg-(--site-accent) text-white hover:bg-(--site-accent-hover)" : "ring-1 ring-border hover:bg-muted",
                    )}
                  >
                    {plan.price ? "Choose" : "Contact"}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.title}>
              <tr>
                <th colSpan={5} scope="colgroup" className="bg-muted/60 px-5 pb-3 pt-6 text-xs font-semibold uppercase tracking-wider text-(--site-accent)">
                  {group.title}
                </th>
              </tr>
              {group.rows.map((item) => (
                <tr key={item.label} className="group/row">
                  <th scope="row" className="border-t border-border/60 px-5 py-4 font-medium transition-colors group-hover/row:bg-muted/50">
                    {item.label}
                  </th>
                  {plans.map((plan) => (
                    <td
                      key={plan.id}
                      className={cn(
                        "border-t border-border/60 px-5 py-4 text-center transition-colors group-hover/row:bg-muted/50",
                        featuredColumn(plan) && "bg-(--site-tint)/50",
                      )}
                    >
                      <Cell value={item.values[plan.id]} featured={featuredColumn(plan)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        {hiddenRows ? (
          <div className={cn("relative flex justify-center border-t border-border p-5", !expanded && "before:pointer-events-none before:absolute before:inset-x-0 before:-top-24 before:h-24 before:bg-linear-to-t before:from-card before:to-transparent")}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-(--site-tint) px-5 text-sm font-semibold text-(--site-accent) transition hover:bg-(--site-accent) hover:text-white"
            >
              {expanded ? "Show fewer features" : `Show all features (${hiddenRows} more)`}
              <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-5 rounded-[1.75rem] border border-dashed border-border bg-card/60 p-6 sm:flex-row sm:items-center sm:p-7">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-(--site-tint) text-(--site-accent)">
          <Clock className="size-5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold">On the roadmap</p>
          <p className="mt-0.5 text-sm text-muted-foreground">In development and not included in any plan yet.</p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {ROADMAP.map((item) => (
            <li key={item} className="rounded-full bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function PricingPlans() {
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const plans = usePlans();
  return (
    <>
      <section className="relative overflow-hidden rounded-b-[2rem] bg-(--site-ink) px-4 pb-52 pt-32 text-white sm:rounded-b-[3rem] sm:px-6 sm:pt-44">
        <HeroBackdrop />
        <div className="relative mx-auto max-w-3xl text-center">
          <Eyebrow onDark>Pricing</Eyebrow>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-6xl xl:text-7xl">
            Plans that grow with <Highlight>your team.</Highlight>
          </h1>
          <p className="mt-5 text-base leading-7 text-white/70 sm:text-lg">Pay per seat for the people who send. Recipients always sign for free.</p>
          <div className="mt-9 flex justify-center">
            <CycleToggle cycle={cycle} onChange={setCycle} dark />
          </div>
          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/70">
            {["Recipients always sign free", "Cancel renewal anytime", "Add seats later, prorated"].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckDot onDark />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="relative -mt-36">
        <div className="site-container">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} cycle={cycle} />
            ))}
          </div>
          <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Prices in USD, excluding taxes. Taxes are calculated at payment based on your billing address.
          </p>
        </div>
      </section>

      <SeatCalculator cycle={cycle} onCycleChange={setCycle} />
      <ComparisonTable cycle={cycle} onCycleChange={setCycle} />
    </>
  );
}
