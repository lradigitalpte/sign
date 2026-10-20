import { CalendarClock, Info, Pencil, RefreshCw, TrendingUp, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@signet/ui/components/button";
import { Input } from "@signet/ui/components/input";
import { Label } from "@signet/ui/components/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@signet/ui/components/table";
import { cn } from "@signet/ui/lib/utils";

import { ActionDialog, Notice, type ActionSpec } from "@/components/action-dialog";
import { useCan } from "@/lib/admin-context";
import { Badge, Card, CardHeader, EmptyState, ErrorState, Loading, PageHeader, PlanBadge } from "@/components/page";
import { useBillingOverview } from "@/lib/api";
import { formatDate, formatDateTime, formatMoney, formatMoneyCompact, formatNumber, formatRelative, planLabels } from "@/lib/format";
import type { BillingEvent, BillingEventKind, BillingOverview, PlanPrice, PlanRevenue, PriceSet } from "@/lib/types";

const discount = (p: PriceSet) => (p.monthlyCents && p.annualCents !== null ? Math.round((1 - p.annualCents / p.monthlyCents) * 100) : 0);

const priceText = (p: PriceSet) => (p.monthlyCents === null ? "Contact sales" : `${formatMoney(p.monthlyCents)} / ${formatMoney(p.annualCents ?? 0)}`);

// ---- Headline figures ----

function Tile({ label, value, hint, tone, icon }: { label: string; value: string; hint: ReactNode; tone?: "danger"; icon?: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4 shadow-xs", tone === "danger" && "border-red-500/30 bg-red-500/5")}>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {label}
        <span className={cn(tone === "danger" && "text-red-600 dark:text-red-400")}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Headline({ o }: { o: BillingOverview }) {
  const arpa = o.payingWorkspaces ? Math.round(o.mrrCents / o.payingWorkspaces) : 0;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Monthly recurring revenue" value={formatMoneyCompact(o.mrrCents)} hint={`${formatMoneyCompact(o.arrCents)} a year (ARR)`} icon={<TrendingUp className="size-4" />} />
      <Tile label="Paying workspaces" value={formatNumber(o.payingWorkspaces)} hint={`${formatNumber(o.paidSeats)} paid seats · ${formatNumber(o.freeWorkspaces)} on Free`} />
      <Tile label="Average per workspace" value={formatMoney(arpa)} hint="Each month, across paying workspaces" />
      <Tile
        label="Past due"
        value={formatMoneyCompact(o.pastDueMrrCents)}
        hint={o.pastDueWorkspaces ? `${formatNumber(o.pastDueWorkspaces)} ${o.pastDueWorkspaces === 1 ? "workspace hasn't" : "workspaces haven't"} paid` : "Everyone is paid up"}
        tone={o.pastDueWorkspaces ? "danger" : undefined}
        icon={<TriangleAlert className="size-4" />}
      />
    </div>
  );
}

// ---- Packages ----

type PriceDraft = { plan: PlanPrice["plan"]; monthly: string; annual: string; contactSales: boolean };

const centsFrom = (dollars: string) => {
  const value = Number(dollars.trim());
  return dollars.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= 100_000 ? Math.round(value * 100) : null;
};

const dollarsFrom = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(cents % 100 ? 2 : 0));

function priceSpec(current: PlanRevenue, draft: PriceDraft, setDraft: (next: PriceDraft) => void): ActionSpec<PlanPrice> {
  const monthly = centsFrom(draft.monthly);
  const annual = centsFrom(draft.annual);
  const priced = !draft.contactSales;
  const valid = !priced || (monthly !== null && annual !== null && annual <= monthly);
  const subscribers = current.workspaces + current.trialing;
  const update = (patch: Partial<PriceDraft>) => setDraft({ ...draft, ...patch });
  return {
    title: `Change ${planLabels[current.plan]} pricing`,
    description: (
      <>
        Prices are per seat per month, in US dollars. The pricing and checkout pages show the new price within a minute.{" "}
        {subscribers ? `The ${formatNumber(subscribers)} ${subscribers === 1 ? "workspace" : "workspaces"} already on ${planLabels[current.plan]} keep what they pay now.` : null}
      </>
    ),
    confirmLabel: "Save prices",
    reasonPlaceholder: "e.g. 2027 price update approved by finance",
    ready: valid,
    fields: (
      <>
        {current.plan === "enterprise" ? (
          <label className="flex items-start gap-2.5 rounded-xl border p-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={draft.contactSales} onChange={(event) => update({ contactSales: event.target.checked })} />
            <span>
              <span className="font-medium">Contact sales</span>
              <span className="block text-xs text-muted-foreground">No price on the pricing page; each contract is priced on its own.</span>
            </span>
          </label>
        ) : null}
        {priced ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="price-monthly">Billed monthly</Label>
              <div className="relative">
                <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input id="price-monthly" inputMode="decimal" value={draft.monthly} onChange={(event) => update({ monthly: event.target.value })} className="ps-7 tabular-nums" aria-describedby="price-hint" />
              </div>
              <p className="text-xs text-muted-foreground">Now {current.monthlyCents === null ? "not listed" : formatMoney(current.monthlyCents)}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="price-annual">Billed annually</Label>
              <div className="relative">
                <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input id="price-annual" inputMode="decimal" value={draft.annual} onChange={(event) => update({ annual: event.target.value })} className="ps-7 tabular-nums" aria-describedby="price-hint" />
              </div>
              <p className="text-xs text-muted-foreground">Now {current.annualCents === null ? "not listed" : formatMoney(current.annualCents)}</p>
            </div>
            <p id="price-hint" className={cn("col-span-2 text-xs", valid ? "text-muted-foreground" : "text-destructive")}>
              {monthly === null || annual === null
                ? "Enter both prices in dollars, e.g. 24 or 24.50."
                : annual > monthly
                  ? "The annual price is a monthly equivalent, so it can't be more than the monthly price."
                  : `Annual billing saves ${discount({ monthlyCents: monthly, annualCents: annual })}%, ${formatMoney((monthly - annual) * 12)} per seat a year.`}
            </p>
          </div>
        ) : null}
      </>
    ),
    request: (reason) => ({
      method: "PUT",
      path: `/plans/${current.plan}/price`,
      body: { monthlyCents: priced ? monthly : null, annualCents: priced ? annual : null, reason },
    }),
    success: (price) => `${planLabels[price.plan]} is now ${price.monthlyCents === null ? "contact sales" : `${formatMoney(price.monthlyCents)} monthly, ${formatMoney(price.annualCents ?? 0)} annually`}.`,
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function PackageCard({ plan, onEdit }: { plan: PlanRevenue; onEdit?: () => void }) {
  const priced = plan.monthlyCents !== null;
  const saving = discount(plan);
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <PlanBadge plan={plan.plan} />
        {onEdit ? (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil /> Edit price
          </Button>
        ) : null}
      </div>
      <div className="mt-4">
        {priced ? (
          <>
            <p className="flex items-baseline gap-1">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatMoney(plan.monthlyCents!)}</span>
              <span className="text-sm text-muted-foreground">/ seat / mo</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatMoney(plan.annualCents!)} billed annually{saving ? <Badge tone="success" className="ms-2">Save {saving}%</Badge> : null}
            </p>
          </>
        ) : (
          <>
            <p className="text-3xl font-semibold tracking-tight">Custom</p>
            <p className="mt-1 text-sm text-muted-foreground">Contact sales · priced per contract</p>
          </>
        )}
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t pt-4 text-sm">
        <Stat label="Paying" value={formatNumber(plan.workspaces)} />
        <Stat label="Seats" value={formatNumber(plan.seats)} />
        <Stat label="MRR" value={formatMoneyCompact(plan.mrrCents)} />
      </dl>
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {plan.trialing ? <li>{formatNumber(plan.trialing)} on trial</li> : null}
        {plan.offListWorkspaces ? (
          <li className="text-amber-700 dark:text-amber-300">
            {formatNumber(plan.offListWorkspaces)} {plan.offListWorkspaces === 1 ? "pays" : "pay"} a different price than today&apos;s
          </li>
        ) : null}
        {plan.unpricedWorkspaces ? (
          <li className="text-amber-700 dark:text-amber-300">
            {formatNumber(plan.unpricedWorkspaces)} with no price agreed, counted as $0
          </li>
        ) : null}
      </ul>
      <p className="mt-auto pt-4 text-xs text-muted-foreground" title={formatDateTime(plan.updatedAt)}>
        Price set {formatRelative(plan.updatedAt)}
        {plan.updatedByName ? ` by ${plan.updatedByName}` : ""}
      </p>
    </Card>
  );
}

// ---- Revenue mix ----

function RevenueMix({ o }: { o: BillingOverview }) {
  const max = Math.max(1, ...o.plans.map((p) => p.mrrCents));
  const cycleTotal = o.annualMrrCents + o.monthlyMrrCents;
  const share = (cents: number) => (cycleTotal ? Math.round((cents / cycleTotal) * 100) : 0);
  const cycles = [
    { key: "annual", label: "Annual", cents: o.annualMrrCents, color: "var(--series-1)" },
    { key: "monthly", label: "Monthly", cents: o.monthlyMrrCents, color: "var(--series-2)" },
  ];
  return (
    <Card className="p-5">
      <h2 className="font-semibold">Revenue mix</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Monthly recurring revenue by plan and billing cycle</p>

      <ul className="mt-4 space-y-2">
        {o.plans.map((p) => (
          <li key={p.plan} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3 text-sm">
            <span>{planLabels[p.plan]}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full bg-primary" style={{ width: `${(p.mrrCents / max) * 100}%` }} />
            </span>
            <span className="text-end font-semibold tabular-nums">{formatMoneyCompact(p.mrrCents)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 border-t pt-4">
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          {cycleTotal ? cycles.map((c) => (c.cents ? <div key={c.key} style={{ width: `${(c.cents / cycleTotal) * 100}%`, background: c.color }} /> : null)) : null}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {cycles.map((c) => (
            <li key={c.key} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
              <span className="flex-1">{c.label}</span>
              <span className="font-semibold tabular-nums">{formatMoneyCompact(c.cents)}</span>
              <span className="w-9 text-end text-xs text-muted-foreground tabular-nums">{cycleTotal ? `${share(c.cents)}%` : "—"}</span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="mt-4 space-y-2 border-t pt-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Trials, if they all convert</dt>
          <dd className="font-semibold tabular-nums">
            +{formatMoneyCompact(o.trialMrrCents)}
            <span className="font-normal text-muted-foreground"> · {formatNumber(o.trialingWorkspaces)}</span>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Everyone on today&apos;s prices</dt>
          <dd className="font-semibold tabular-nums">
            {o.listPriceDeltaCents >= 0 ? "+" : "−"}
            {formatMoneyCompact(Math.abs(o.listPriceDeltaCents))}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

// ---- Upcoming ----

const eventMeta: Record<BillingEventKind, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  past_due: { label: "Past due", tone: "danger" },
  trial_end: { label: "Trial ends", tone: "info" },
  renewal: { label: "Renews", tone: "success" },
  access_end: { label: "Canceled, access ends", tone: "neutral" },
};

function UpcomingRow({ event }: { event: BillingEvent }) {
  const meta = eventMeta[event.kind];
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="ps-5">
        <Link to={`/workspaces/${event.workspaceId}`} className="font-medium hover:text-primary hover:underline">
          {event.workspaceName}
        </Link>
        <p className="text-xs text-muted-foreground sm:hidden">{event.date ? formatDate(event.date) : "No date set"}</p>
      </TableCell>
      <TableCell>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {event.date ? (
          <span title={formatDateTime(event.date)}>
            {formatDate(event.date)} <span className="text-xs text-muted-foreground">· {formatRelative(event.date)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">No date set</span>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className="text-sm">{planLabels[event.plan]}</span>
        <span className="text-xs text-muted-foreground">
          {" "}
          · {formatNumber(event.seats)} {event.seats === 1 ? "seat" : "seats"}
          {event.billingCycle ? ` · ${event.billingCycle}` : ""}
        </span>
      </TableCell>
      <TableCell className="pe-5 text-end font-semibold tabular-nums">{event.amountCents === null ? <span className="font-normal text-muted-foreground">No price</span> : formatMoney(event.amountCents)}</TableCell>
    </TableRow>
  );
}

function UpcomingCard({ events }: { events: BillingEvent[] }) {
  return (
    <Card className="overflow-hidden lg:col-span-2">
      <CardHeader title="Coming up" description="Missed payments, then renewals, trial ends and cancellations in the next 30 days" />
      {events.length === 0 ? (
        <EmptyState title="Nothing in the next 30 days" description="Renewals and trial ends show up here once workspaces have a renewal date set." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="ps-5">Workspace</TableHead>
              <TableHead>Event</TableHead>
              <TableHead className="hidden sm:table-cell">Date</TableHead>
              <TableHead className="hidden md:table-cell">Plan</TableHead>
              <TableHead className="pe-5 text-end">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <UpcomingRow key={`${event.kind}-${event.workspaceId}`} event={event} />
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

// ---- Price history ----

function PriceHistory({ changes }: { changes: BillingOverview["priceChanges"] }) {
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <CalendarClock className="size-4 text-muted-foreground" /> Price changes
      </h2>
      {changes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No price changes yet. Every change is listed here and in the audit log.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {changes.map((change) => (
            <li key={`${change.plan}-${change.occurredAt}`} className="text-sm">
              <p>
                <span className="font-medium">{planLabels[change.plan]}</span>{" "}
                <span className="text-muted-foreground tabular-nums">
                  {priceText(change.before)} → <span className="font-medium text-foreground">{priceText(change.after)}</span>
                </span>
              </p>
              <p className="text-xs text-muted-foreground" title={formatDateTime(change.occurredAt)}>
                {change.adminName ?? "An admin"} · {formatRelative(change.occurredAt)}
                {change.reason ? ` · “${change.reason}”` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ---- Page ----

export function BillingPage() {
  const overview = useBillingOverview();
  const canEdit = useCan("super_admin");
  const [draft, setDraft] = useState<PriceDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const o = overview.data;
  const editing = draft && o ? o.plans.find((p) => p.plan === draft.plan) : undefined;

  const edit = (plan: PlanRevenue) =>
    setDraft({ plan: plan.plan, monthly: dollarsFrom(plan.monthlyCents), annual: dollarsFrom(plan.annualCents), contactSales: plan.monthlyCents === null });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plans & billing"
        description="Packages, prices and recurring revenue across every workspace."
        actions={
          <Button variant="outline" size="sm" onClick={() => void overview.refetch()} disabled={overview.isFetching}>
            <RefreshCw className={cn(overview.isFetching && "animate-spin")} /> Refresh
          </Button>
        }
      />

      <Notice message={notice} onDismiss={() => setNotice(null)} />

      {overview.isPending ? (
        <Card>
          <Loading />
        </Card>
      ) : overview.error ? (
        <Card>
          <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
        </Card>
      ) : (
        <>
          <p className="flex items-start gap-2 rounded-2xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            Revenue is estimated as each workspace&apos;s seats × the price it pays, with trials and cancellations left out. No payment provider is connected yet, so none of this is money collected.
          </p>

          <Headline o={o!} />

          <section aria-labelledby="packages-heading" className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="packages-heading" className="text-sm font-semibold text-muted-foreground">
                Packages
              </h2>
              <p className="text-xs text-muted-foreground">Monthly price, then the annual price as a monthly equivalent. Changing a price never changes what existing workspaces pay.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {o!.plans.map((plan) => (
                <PackageCard key={plan.plan} plan={plan} onEdit={canEdit ? () => edit(plan) : undefined} />
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <UpcomingCard events={o!.upcoming} />
            <RevenueMix o={o!} />
          </div>

          <PriceHistory changes={o!.priceChanges} />
        </>
      )}

      <ActionDialog spec={draft && editing ? (priceSpec(editing, draft, setDraft) as ActionSpec<never>) : null} onClose={() => setDraft(null)} onDone={setNotice} />
    </div>
  );
}
