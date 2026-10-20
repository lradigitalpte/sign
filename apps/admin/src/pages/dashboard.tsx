import { ArrowUpRight, Ban, Building2, ChartLine, CircleCheck, CircleX, Hourglass, Mail, RefreshCw, Send, Table2, TriangleAlert, Users, UserX, Webhook, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@signet/ui/components/button";
import { cn } from "@signet/ui/lib/utils";

import { PlanMix } from "@/components/plan-mix";
import { StatusBreakdown } from "@/components/status-breakdown";
import { ActivityChart, ActivityTable, groupByWeek, Legend } from "@/components/activity-chart";
import { useAdmin } from "@/lib/admin-context";
import { Card, ErrorState, Loading, SuspensionBadge } from "@/components/page";
import { useStats, useUsers, useWorkspaces } from "@/lib/api";
import { formatNumber, formatRelative } from "@/lib/format";
import type { Stats } from "@/lib/types";

const ranges = [30, 90, 180] as const;
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors",
            value === option.value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Kpi({ label, value, delta, icon: Icon, to }: { label: string; value: number; delta?: ReactNode; icon: LucideIcon; to?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between text-muted-foreground">
        <p className="text-sm font-medium">{label}</p>
        <Icon className="size-4" />
      </div>
      <p className="mt-4 text-4xl font-semibold tracking-tight">{formatNumber(value)}</p>
      <p className="mt-2 text-xs text-muted-foreground">{delta}</p>
    </>
  );
  return to ? (
    <Link to={to} className="group rounded-2xl border bg-card p-5 shadow-xs transition-colors hover:border-primary/40">
      {body}
    </Link>
  ) : (
    <div className="rounded-2xl border bg-card p-5 shadow-xs">{body}</div>
  );
}

function Delta({ value, suffix }: { value: number; suffix: string }) {
  return value > 0 ? (
    <span className="font-medium text-emerald-700 dark:text-emerald-400">
      +{formatNumber(value)} {suffix}
    </span>
  ) : (
    <span>No change {suffix}</span>
  );
}

type Severity = "ok" | "warning" | "critical";
const severity: Record<Severity, { icon: LucideIcon; label: string; className: string }> = {
  ok: { icon: CircleCheck, label: "OK", className: "text-emerald-700 dark:text-emerald-400" },
  warning: { icon: TriangleAlert, label: "Check", className: "text-amber-700 dark:text-amber-400" },
  critical: { icon: CircleX, label: "Action", className: "text-red-700 dark:text-red-400" },
};

function HealthPanel({ stats }: { stats: Stats }) {
  const items: { label: string; value: number; icon: LucideIcon; level: Severity; to?: string }[] = [
    { label: "Failed emails", value: stats.emailJobs.failed, icon: Mail, level: stats.emailJobs.failed > 0 ? "critical" : "ok", to: "/email-queue" },
    { label: "Emails waiting", value: stats.emailJobs.pending, icon: Hourglass, level: stats.emailJobs.pending > 20 ? "warning" : "ok", to: "/email-queue?status=queued" },
    { label: "Unprocessed webhooks", value: stats.webhooksUnprocessed, icon: Webhook, level: stats.webhooksUnprocessed > 0 ? "warning" : "ok", to: "/webhooks" },
    { label: "Suspended workspaces", value: stats.workspaces.suspended, icon: Ban, level: "ok", to: "/workspaces?status=suspended" },
    { label: "Suspended users", value: stats.users.suspended, icon: UserX, level: "ok", to: "/users?status=suspended" },
  ];
  const issues = items.filter((item) => item.level !== "ok").length;

  return (
    <Card className="flex flex-col">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold">Health</h2>
        <p className={cn("mt-0.5 flex items-center gap-1.5 text-sm", issues ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400")}>
          {issues ? <TriangleAlert className="size-4" /> : <CircleCheck className="size-4" />}
          {issues ? `${issues} ${issues === 1 ? "item needs" : "items need"} attention` : "Everything looks normal"}
        </p>
      </div>
      <ul className="flex-1 divide-y">
        {items.map(({ label, value, icon: Icon, level, to }) => {
          const status = severity[level];
          const row = (
            <>
              <Icon className="size-4 text-muted-foreground" />
              <span className="flex-1 text-sm">{label}</span>
              <span className="text-sm font-semibold tabular-nums">{formatNumber(value)}</span>
              <span className={cn("inline-flex w-16 items-center justify-end gap-1 text-xs font-medium", status.className)}>
                <status.icon className="size-3.5" />
                {status.label}
              </span>
            </>
          );
          return (
            <li key={label}>
              {to ? (
                <Link to={to} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50">
                  {row}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-5 py-3">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function RecentList({ title, to, items, empty }: { title: string; to: string; items: { id: string; href: string; primary: string; secondary: string; createdAt: string; suspendedAt: string | null }[] | undefined; empty: string }) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        <Link to={to} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          View all <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      {!items ? (
        <Loading />
      ) : items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={item.href} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">{item.primary.slice(0, 1)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.primary}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.secondary}</span>
                </span>
                {item.suspendedAt ? <SuspensionBadge suspendedAt={item.suspendedAt} /> : <span className="text-xs text-muted-foreground">{formatRelative(item.createdAt)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const admin = useAdmin();
  const [days, setDays] = useState<(typeof ranges)[number]>(90);
  const [view, setView] = useState<"chart" | "table">("chart");
  const stats = useStats(days);
  // Daily for a month; weekly beyond that so sparse days don't read as spikes.
  const unit = days > 30 ? "week" : "day";
  const activity = stats.data ? (unit === "week" ? groupByWeek(stats.data.activity) : stats.data.activity) : [];
  const workspaces = useWorkspaces({ pageSize: 5 });
  const users = useUsers({ pageSize: 5 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back, {admin.name.split(" ")[0]}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Overview</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {stats.dataUpdatedAt ? <span>Updated {timeFormat.format(stats.dataUpdatedAt)}</span> : null}
          <Button variant="outline" size="sm" onClick={() => void stats.refetch()} disabled={stats.isFetching}>
            <RefreshCw className={cn(stats.isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {stats.isPending ? (
        <Card>
          <Loading />
        </Card>
      ) : stats.error ? (
        <Card>
          <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Workspaces" value={stats.data.workspaces.total} icon={Building2} to="/workspaces" delta={<Delta value={stats.data.workspaces.new7d} suffix="this week" />} />
            <Kpi label="Users" value={stats.data.users.total} icon={Users} to="/users" delta={<Delta value={stats.data.users.new7d} suffix="this week" />} />
            <Kpi label="Envelopes sent" value={stats.data.envelopes.sent7d} icon={Send} delta={`${formatNumber(stats.data.envelopes.completed7d)} completed · last 7 days`} />
            <Kpi label="Awaiting signatures" value={stats.data.envelopes.byStatus.in_progress ?? 0} icon={Hourglass} delta="Envelopes in progress right now" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <div>
                  <h2 className="font-semibold">Envelope activity</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Sent and completed per {unit} (UTC), last {days} days
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Segmented label="Range" value={days} onChange={setDays} options={ranges.map((r) => ({ value: r, label: `${r}d`, title: `Last ${r} days` }))} />
                  <Segmented
                    label="View"
                    value={view}
                    onChange={setView}
                    options={[
                      { value: "chart", label: <ChartLine className="size-3.5" />, title: "Chart" },
                      { value: "table", label: <Table2 className="size-3.5" />, title: "Table" },
                    ]}
                  />
                </div>
              </div>
              <div className="px-5 pb-5 pt-4">
                {view === "chart" ? (
                  <>
                    <div className="mb-3 flex justify-end">
                      <Legend />
                    </div>
                    <ActivityChart data={activity} unit={unit} />
                  </>
                ) : (
                  <ActivityTable data={activity} unit={unit} />
                )}
              </div>
            </Card>
            <HealthPanel stats={stats.data} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <StatusBreakdown counts={stats.data.envelopes.byStatus} />
            {stats.data.plans ? <PlanMix counts={stats.data.plans} /> : null}
            <RecentList
              title="Newest workspaces"
              to="/workspaces"
              empty="No workspaces yet."
              items={workspaces.data?.items.map((w) => ({ id: w.id, href: `/workspaces/${w.id}`, primary: w.name, secondary: w.ownerEmail ?? w.slug, createdAt: w.createdAt, suspendedAt: w.suspendedAt }))}
            />
            <RecentList
              title="Newest users"
              to="/users"
              empty="No users yet."
              items={users.data?.items.map((u) => ({ id: u.id, href: `/users/${u.id}`, primary: u.name, secondary: u.email, createdAt: u.createdAt, suspendedAt: u.suspendedAt }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
