import { ChevronLeft, ChevronRight, CircleAlert, Inbox, LoaderCircle, Search } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@signet/ui/components/button";
import { Input } from "@signet/ui/components/input";
import { cn } from "@signet/ui/lib/utils";

import { envelopeStatusLabels, formatNumber, planLabels, roleLabels } from "@/lib/format";

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2 text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border bg-card text-card-foreground shadow-xs", className)}>{children}</section>;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  success: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:text-amber-300",
  danger: "bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300",
  info: "bg-primary/10 text-primary ring-primary/20",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", toneClasses[tone], className)}>{children}</span>;
}

export function SuspensionBadge({ suspendedAt }: { suspendedAt: string | null }) {
  return suspendedAt ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>;
}

export function RoleBadge({ role }: { role: string }) {
  const tone: Tone = role === "super_admin" || role === "owner" ? "info" : "neutral";
  return <Badge tone={tone}>{roleLabels[role] ?? role}</Badge>;
}

/** Paid plans stand out; Free stays quiet. */
export function PlanBadge({ plan }: { plan: string }) {
  return <Badge tone={plan === "free" ? "neutral" : "info"}>{planLabels[plan] ?? plan}</Badge>;
}

const envelopeTones: Record<string, Tone> = { draft: "neutral", in_progress: "warning", completed: "success", voided: "danger", expired: "neutral" };

export function EnvelopeStatusBadge({ status }: { status: string }) {
  return <Badge tone={envelopeTones[status] ?? "neutral"}>{envelopeStatusLabels[status] ?? status}</Badge>;
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="ps-9" aria-label={placeholder} />
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-4 border-t px-5 py-3 text-sm text-muted-foreground">
      <p>
        {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft />
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
      <LoaderCircle className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Inbox className="size-5" />
      </span>
      <p className="mt-4 font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <CircleAlert className="size-5" />
      </span>
      <p className="mt-4 font-medium">Couldn&apos;t load this</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end font-medium break-words">{children}</dd>
    </div>
  );
}
