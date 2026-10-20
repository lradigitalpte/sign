import { Activity, CheckCircle2, CircleAlert, CircleSlash, Cpu, Database, HardDrive, Mail, RefreshCw, Server, TriangleAlert, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@signet/ui/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@signet/ui/components/table";
import { cn } from "@signet/ui/lib/utils";

import { Badge, Card, CardHeader, EmptyState, ErrorState, Loading, PageHeader } from "@/components/page";
import { useSystemHealth } from "@/lib/api";
import { formatBytes, formatDateTime, formatDuration, formatNumber, formatRelative } from "@/lib/format";
import type { FileCategory, HealthCheck, HealthStatus, ScheduledJob, ScheduledJobStatus, ServiceInstance, SystemHealth } from "@/lib/types";

type Tone = "success" | "warning" | "danger" | "neutral";

const checkMeta: Record<HealthStatus, { label: string; tone: Tone }> = {
  ok: { label: "Operational", tone: "success" },
  off: { label: "Not configured", tone: "neutral" },
  degraded: { label: "Degraded", tone: "warning" },
  down: { label: "Down", tone: "danger" },
};

const jobMeta: Record<ScheduledJobStatus, { label: string; tone: Tone }> = {
  ok: { label: "On schedule", tone: "success" },
  late: { label: "Late", tone: "warning" },
  failing: { label: "Failing", tone: "danger" },
  never: { label: "Not run yet", tone: "neutral" },
};

const checkIcons: Record<string, typeof Database> = {
  database: Database,
  storage: HardDrive,
  email_relay: Mail,
  email_delivery: Mail,
  workos: Server,
};

const dotClasses: Record<Tone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-muted-foreground/40",
};

function StatusDot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return (
    <span className="relative flex size-2.5 shrink-0" aria-hidden>
      {pulse ? <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", dotClasses[tone])} /> : null}
      <span className={cn("relative inline-flex size-2.5 rounded-full", dotClasses[tone])} />
    </span>
  );
}

function formatInterval(seconds: number) {
  if (seconds === 60) return "Every minute";
  if (seconds === 3600) return "Every hour";
  if (seconds < 60) return `Every ${seconds} s`;
  if (seconds < 3600) return `Every ${Math.round(seconds / 60)} min`;
  return `Every ${Math.round(seconds / 3600)} h`;
}

const uptime = (startedAt: string) => formatDuration((Date.now() - new Date(startedAt).getTime()) / 1000);

// ---- Overall ----

type Issue = { key: string; title: string; detail?: string; tone: Tone };

function issuesOf(health: SystemHealth): Issue[] {
  const issues: Issue[] = [];
  for (const check of health.checks) {
    if (check.status === "down" || check.status === "degraded") {
      issues.push({ key: `check-${check.key}`, title: `${check.name}: ${checkMeta[check.status].label.toLowerCase()}`, detail: check.error ?? check.detail, tone: checkMeta[check.status].tone });
    }
  }
  for (const job of health.jobs) {
    if (job.status === "failing") issues.push({ key: `job-${job.name}`, title: `${job.label}: last run failed`, detail: job.lastError ?? undefined, tone: "danger" });
    if (job.status === "late") issues.push({ key: `job-${job.name}`, title: `${job.label}: hasn't run since ${job.lastFinishedAt ? formatRelative(job.lastFinishedAt) : "it started"}`, detail: `Expected ${formatInterval(job.intervalSeconds).toLowerCase()} on the ${job.runsOn.toLowerCase()}.`, tone: "warning" });
  }
  return issues;
}

const overallMeta = {
  ok: { title: "All systems operational", icon: CheckCircle2, classes: "border-emerald-500/30 bg-emerald-500/5", iconClasses: "text-emerald-600 dark:text-emerald-400" },
  degraded: { title: "Some services need attention", icon: TriangleAlert, classes: "border-amber-500/30 bg-amber-500/5", iconClasses: "text-amber-600 dark:text-amber-400" },
  down: { title: "Part of Signet is down", icon: XCircle, classes: "border-red-500/30 bg-red-500/5", iconClasses: "text-red-600 dark:text-red-400" },
} as const;

function OverallBanner({ health }: { health: SystemHealth }) {
  const meta = overallMeta[health.status];
  const issues = issuesOf(health);
  const Icon = meta.icon;
  return (
    <section className={cn("rounded-2xl border p-5", meta.classes)} aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Icon className={cn("size-6 shrink-0", meta.iconClasses)} />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{meta.title}</h2>
            <p className="text-sm text-muted-foreground">
              {issues.length === 0 ? "Every service is answering and every background job is on schedule." : `${issues.length} ${issues.length === 1 ? "issue" : "issues"} found`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge className="capitalize">{health.environment}</Badge>
          <span className="font-mono">{health.runtime.version}</span>
        </div>
      </div>
      {issues.length ? (
        <ul className="mt-4 grid gap-2">
          {issues.map((issue) => (
            <li key={issue.key} className="flex items-start gap-2.5 rounded-xl bg-background/70 px-3 py-2 text-sm">
              <span className="mt-1.5">
                <StatusDot tone={issue.tone} />
              </span>
              <div className="min-w-0">
                <p className="font-medium">{issue.title}</p>
                {issue.detail ? <p className="truncate text-xs text-muted-foreground" title={issue.detail}>{issue.detail}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// ---- Dependency checks ----

function CheckCard({ check }: { check: HealthCheck }) {
  const meta = checkMeta[check.status];
  const Icon = checkIcons[check.key] ?? Activity;
  return (
    <Card className={cn("p-4", meta.tone === "danger" && "border-red-500/30", meta.tone === "warning" && "border-amber-500/30")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
          <h3 className="font-medium">{check.name}</h3>
        </div>
        <Badge tone={meta.tone}>
          <StatusDot tone={meta.tone} pulse={check.status === "down"} />
          {meta.label}
        </Badge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{check.detail || "—"}</p>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        {check.error ? (
          <p className={cn("min-w-0 truncate font-mono", meta.tone === "danger" ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300")} title={check.error}>
            {check.error}
          </p>
        ) : (
          <span />
        )}
        {check.latencyMs !== null ? <span className="shrink-0 tabular-nums text-muted-foreground">{formatNumber(check.latencyMs)} ms</span> : null}
      </div>
    </Card>
  );
}

// ---- Background jobs ----

function JobRow({ job }: { job: ScheduledJob }) {
  const meta = jobMeta[job.status];
  return (
    <TableRow className="align-top hover:bg-transparent">
      <TableCell className="ps-5 whitespace-normal">
        <p className="font-medium">{job.label}</p>
        <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{job.description}</p>
        <div className="mt-1.5 sm:hidden">
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
        {job.status === "failing" && job.lastError ? (
          <pre className="mt-2 max-h-24 max-w-md overflow-auto rounded-lg border border-red-500/20 bg-red-500/5 p-2 font-mono text-[11px] whitespace-pre-wrap text-red-800 dark:text-red-200">{job.lastError}</pre>
        ) : null}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <p className="text-sm">{formatInterval(job.intervalSeconds)}</p>
        <p className="text-xs text-muted-foreground">{job.runsOn}</p>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {job.lastFinishedAt ? (
          <>
            <p className="text-sm" title={formatDateTime(job.lastFinishedAt)}>
              {formatRelative(job.lastFinishedAt)}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              took {formatNumber(job.lastDurationMs ?? 0)} ms · {formatNumber(job.runs)} runs
              {job.failures ? `, ${formatNumber(job.failures)} failed` : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Never</p>
        )}
      </TableCell>
      <TableCell className="hidden pe-5 text-end sm:table-cell">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {job.status === "failing" && job.lastSuccessAt ? <p className="mt-1 text-xs text-muted-foreground">Last worked {formatRelative(job.lastSuccessAt)}</p> : null}
      </TableCell>
    </TableRow>
  );
}

function JobsCard({ jobs }: { jobs: ScheduledJob[] }) {
  return (
    <Card className="overflow-hidden lg:col-span-2">
      <CardHeader title="Background jobs" description="Recurring work and when each last ran, from whichever process ran it" />
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="ps-5">Job</TableHead>
            <TableHead className="hidden md:table-cell">Schedule</TableHead>
            <TableHead className="hidden lg:table-cell">Last run</TableHead>
            <TableHead className="hidden pe-5 text-end sm:table-cell">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <JobRow key={job.name} job={job} />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ---- Email queue ----

function QueueFigure({ label, value, tone }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", tone === "danger" && "text-red-700 dark:text-red-300", tone === "warning" && "text-amber-700 dark:text-amber-300")}>{value}</span>
    </div>
  );
}

function EmailQueueCard({ queue }: { queue: SystemHealth["emailQueue"] }) {
  const attention = queue.stuck + queue.gaveUp;
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Mail className="size-4 text-muted-foreground" /> Email queue
        </h2>
        <Link to="/email-queue" className="text-xs font-medium text-primary hover:underline">
          Open
        </Link>
      </div>
      <div className="mt-3 divide-y">
        <QueueFigure label="Waiting to send" value={formatNumber(queue.queued)} />
        <QueueFigure label="Retrying" value={formatNumber(queue.retrying)} tone={queue.retrying ? "warning" : undefined} />
        <QueueFigure label="Stuck or gave up" value={formatNumber(attention)} tone={attention ? "danger" : undefined} />
        <QueueFigure label="Delivered · 24h" value={formatNumber(queue.sent24h)} />
        <QueueFigure label="Oldest waiting" value={queue.oldestQueuedAt ? formatRelative(queue.oldestQueuedAt).replace(/ ago$/, "") : "—"} />
      </div>
    </Card>
  );
}

// ---- Storage ----

const fileColors: Record<FileCategory["key"], string> = {
  documents: "var(--series-1)",
  signed: "var(--series-2)",
  attachments: "var(--series-3)",
  vault: "var(--series-4)",
};

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Stored files by kind as one stacked bar; hovering a segment or a legend row reads it out. */
function FileBreakdown({ files }: { files: FileCategory[] }) {
  const [active, setActive] = useState<FileCategory["key"] | null>(null);
  const total = files.reduce((sum, f) => sum + f.bytes, 0);
  const share = (bytes: number) => (total ? `${Math.round((bytes / total) * 100)}%` : "—");
  const focused = files.find((f) => f.key === active);
  return (
    <div className="px-5 py-4">
      <p className="h-5 text-xs text-muted-foreground" aria-live="polite">
        {focused ? (
          <>
            <span className="font-medium text-foreground">{focused.label}</span> · {formatNumber(focused.count)} files · {focused.estimated ? "≈ " : ""}
            {formatBytes(focused.bytes)} · {share(focused.bytes)}
          </>
        ) : (
          "Hover a segment for details"
        )}
      </p>
      <div className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden onPointerLeave={() => setActive(null)}>
        {total > 0
          ? files.map((f) =>
              f.bytes > 0 ? (
                <div
                  key={f.key}
                  className={cn("h-full transition-opacity", active && active !== f.key && "opacity-40")}
                  style={{ width: `${(f.bytes / total) * 100}%`, background: fileColors[f.key] }}
                  onPointerEnter={() => setActive(f.key)}
                />
              ) : null,
            )
          : null}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {files.map((f) => (
          <li key={f.key} className={cn("flex items-center gap-2.5 rounded-md text-sm transition-opacity", active && active !== f.key && "opacity-50")} onPointerEnter={() => setActive(f.key)} onPointerLeave={() => setActive(null)}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: fileColors[f.key] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {f.label}
              <span className="ms-1.5 text-xs text-muted-foreground">{formatNumber(f.count)}</span>
            </span>
            <span className="font-semibold tabular-nums" title={f.estimated ? "Estimated from the original documents' size" : undefined}>
              {f.estimated ? "≈ " : ""}
              {formatBytes(f.bytes)}
            </span>
            <span className="w-9 text-end text-xs text-muted-foreground tabular-nums">{share(f.bytes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SizeList({ title, rows }: { title: string; rows: { key: string; label: ReactNode; hint: string; bytes: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.bytes));
  return (
    <div className="px-5 py-4">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing stored yet.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <li key={row.key} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{row.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{formatBytes(row.bytes)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(row.bytes / max) * 100}%` }} />
                </span>
                <span className="w-24 shrink-0 text-end text-[11px] text-muted-foreground tabular-nums">{row.hint}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StorageCard({ storage }: { storage: SystemHealth["storage"] }) {
  const fileBytes = storage.files.reduce((sum, f) => sum + f.bytes, 0);
  const fileCount = storage.files.reduce((sum, f) => sum + f.count, 0);
  return (
    <Card className="overflow-hidden lg:col-span-2">
      <CardHeader title="Storage" description="File sizes as recorded when they were uploaded, plus the database on disk" />
      <div className="grid grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Figure label="Files stored" value={formatBytes(fileBytes)} hint={`${formatNumber(fileCount)} files in all`} />
        <Figure label="Database" value={formatBytes(storage.databaseBytes)} hint="Tables, indexes and history" />
        <Figure
          label="In customer buckets"
          value={formatBytes(storage.customBucketBytes)}
          hint={`${formatNumber(storage.customBucketWorkspaces)} ${storage.customBucketWorkspaces === 1 ? "workspace uses" : "workspaces use"} their own storage`}
        />
      </div>
      <FileBreakdown files={storage.files} />
      <div className="grid grid-cols-1 divide-y border-t md:grid-cols-2 md:divide-x md:divide-y-0">
        <SizeList
          title="Largest workspaces"
          rows={storage.topWorkspaces.map((w) => ({
            key: w.id,
            label: (
              <Link to={`/workspaces/${w.id}`} className="font-medium hover:text-primary hover:underline">
                {w.name}
                {w.customBucket ? <span className="ms-1.5 text-xs font-normal text-muted-foreground">own bucket</span> : null}
              </Link>
            ),
            hint: `${formatNumber(w.files)} files`,
            bytes: w.bytes,
          }))}
        />
        <SizeList title="Largest tables" rows={storage.tables.map((t) => ({ key: t.name, label: <span className="font-mono text-xs">{t.name}</span>, hint: `${formatNumber(t.rows)} rows`, bytes: t.bytes }))} />
      </div>
    </Card>
  );
}

// ---- API process ----

function RuntimeCard({ runtime }: { runtime: SystemHealth["runtime"] }) {
  const { pool } = runtime;
  const poolShare = pool.max ? pool.inUse / pool.max : 0;
  return (
    <Card className="flex flex-col p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Cpu className="size-4 text-muted-foreground" /> This API process
      </h2>
      <dl className="mt-3 divide-y text-sm">
        {[
          ["Up for", uptime(runtime.startedAt)],
          ["Memory", `${formatBytes(runtime.heapBytes)} heap · ${formatBytes(runtime.sysBytes)} total`],
          ["Goroutines", formatNumber(runtime.goroutines)],
          ["CPUs", formatNumber(runtime.numCpu)],
          ["Go", runtime.goVersion.replace(/^go/, "")],
          ["Embedded worker", runtime.embeddedWorker ? "On" : "Off"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 rounded-xl bg-muted/50 p-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Database connections</span>
          <span className="tabular-nums">
            <span className="font-semibold">{pool.inUse}</span>
            <span className="text-muted-foreground"> of {pool.max} in use</span>
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-background" aria-hidden>
          <div className={cn("h-full rounded-full", poolShare >= 0.9 ? "bg-red-500" : poolShare >= 0.7 ? "bg-amber-500" : "bg-primary")} style={{ width: `${Math.max(poolShare * 100, pool.inUse ? 4 : 0)}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
          {pool.idle} idle · {formatNumber(pool.waits)} {pool.waits === 1 ? "wait" : "waits"} for a free connection since start
        </p>
      </div>
    </Card>
  );
}

// ---- Processes ----

const roleLabels: Record<string, string> = { email: "Email", scheduler: "Reminders", lifecycle: "Deletions" };

function InstanceRow({ instance }: { instance: ServiceInstance }) {
  return (
    <TableRow className={cn("hover:bg-transparent", !instance.online && "text-muted-foreground")}>
      <TableCell className="ps-5">
        <div className="flex items-center gap-2.5">
          <StatusDot tone={instance.online ? "success" : "neutral"} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium">
              {instance.service === "api" ? "API" : "Worker"}
              {instance.current ? <Badge tone="info">This page</Badge> : null}
            </p>
            <p className="max-w-[14rem] truncate font-mono text-xs text-muted-foreground" title={instance.id}>
              {instance.hostname} · pid {instance.pid}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <div className="flex flex-wrap gap-1">
          {instance.roles.length ? instance.roles.map((role) => <Badge key={role}>{roleLabels[role] ?? role}</Badge>) : <span className="text-xs text-muted-foreground">—</span>}
        </div>
      </TableCell>
      <TableCell className="hidden font-mono text-xs lg:table-cell">{instance.version}</TableCell>
      <TableCell className="hidden sm:table-cell">
        <p className="text-sm tabular-nums">{instance.online ? uptime(instance.startedAt) : "—"}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{formatBytes(instance.memoryBytes)}</p>
      </TableCell>
      <TableCell className="pe-5 text-end">
        <Badge tone={instance.online ? "success" : "neutral"}>{instance.online ? "Online" : "Offline"}</Badge>
        <p className="mt-1 text-xs text-muted-foreground" title={formatDateTime(instance.lastSeenAt)}>
          seen {formatRelative(instance.lastSeenAt)}
        </p>
      </TableCell>
    </TableRow>
  );
}

function ProcessesCard({ instances }: { instances: ServiceInstance[] }) {
  const online = instances.filter((i) => i.online);
  const workers = online.filter((i) => i.service === "worker").length;
  const apis = online.length - workers;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Processes"
        description="API and worker processes that reported in over the last 24 hours. A process is offline after 90 seconds without a heartbeat."
        actions={
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {apis} API · {workers} {workers === 1 ? "worker" : "workers"} online
          </span>
        }
      />
      {instances.length === 0 ? (
        <EmptyState title="No processes have reported in" description="Processes report in every 30 seconds once they run a build with heartbeats." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="ps-5">Process</TableHead>
              <TableHead className="hidden md:table-cell">Also runs</TableHead>
              <TableHead className="hidden lg:table-cell">Version</TableHead>
              <TableHead className="hidden sm:table-cell">Uptime · memory</TableHead>
              <TableHead className="pe-5 text-end">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.map((instance) => (
              <InstanceRow key={instance.id} instance={instance} />
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

// ---- Page ----

export function SystemPage() {
  const health = useSystemHealth();
  const data = health.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System health"
        description="Services, background jobs, processes and storage. Refreshes every 15 seconds."
        actions={
          <>
            {data ? (
              <span className="hidden text-xs text-muted-foreground sm:inline" title={formatDateTime(data.checkedAt)}>
                Checked {formatRelative(data.checkedAt)}
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void health.refetch()} disabled={health.isFetching}>
              <RefreshCw className={cn(health.isFetching && "animate-spin")} /> Refresh
            </Button>
          </>
        }
      />

      {health.isPending ? (
        <Card>
          <Loading label="Checking services…" />
        </Card>
      ) : !data ? (
        <Card>
          <ErrorState error={health.error ?? new Error("The API didn't answer.")} onRetry={() => void health.refetch()} />
        </Card>
      ) : (
        <>
          {health.error ? (
            <p role="alert" className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
              The latest check failed ({health.error.message}). Showing results from {formatRelative(data.checkedAt)}.
            </p>
          ) : null}

          <OverallBanner health={data} />

          <section aria-labelledby="services-heading" className="space-y-3">
            <h2 id="services-heading" className="text-sm font-semibold text-muted-foreground">
              Services
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.checks.map((check) => (
                <CheckCard key={check.key} check={check} />
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <JobsCard jobs={data.jobs} />
            <EmailQueueCard queue={data.emailQueue} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <StorageCard storage={data.storage} />
            <RuntimeCard runtime={data.runtime} />
          </div>

          <ProcessesCard instances={data.instances} />

          {data.status === "down" && data.instances.length === 0 && data.checks[0]?.status === "down" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleSlash className="size-4" /> Jobs, processes and storage can&apos;t be read while the database is down.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
