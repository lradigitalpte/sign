import { CheckCircle2, ChevronRight, CircleAlert, Clock3, LoaderCircle, MailCheck, RefreshCw, RotateCcw, Send, TriangleAlert, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@signet/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@signet/ui/components/dialog";
import { Label } from "@signet/ui/components/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@signet/ui/components/table";
import { Textarea } from "@signet/ui/components/textarea";
import { cn } from "@signet/ui/lib/utils";

import { useCan } from "@/lib/admin-context";
import { Badge, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination, SearchField } from "@/components/page";
import { StatusFilter } from "@/components/status-filter";
import { useEmailJob, useEmailJobs, useRetryEmails } from "@/lib/api";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import type { EmailJob, JobCounts, JobState } from "@/lib/types";
import { useListParams } from "@/lib/use-list-params";

export const jobKindLabels: Record<string, string> = {
  invitation: "Signing invitation",
  reminder: "Reminder",
  completion: "Signed copy",
  sender_viewed: "“Opened” notice",
  sender_signed: "“Signed” notice",
};

const stateMeta: Record<JobState, { label: string; tone: "success" | "warning" | "danger" | "info" }> = {
  gave_up: { label: "Gave up", tone: "danger" },
  stuck: { label: "Stuck", tone: "danger" },
  retrying: { label: "Retrying", tone: "warning" },
  queued: { label: "Queued", tone: "info" },
  sent: { label: "Delivered", tone: "success" },
};

function JobStateBadge({ state }: { state: JobState }) {
  return <Badge tone={stateMeta[state].tone}>{stateMeta[state].label}</Badge>;
}

const filterOptions = [
  { value: "", label: "All" },
  { value: "attention", label: "Needs attention" },
  { value: "retrying", label: "Retrying" },
  { value: "queued", label: "Queued" },
  { value: "sent", label: "Delivered" },
];

/** What the row's time column says, by state. */
function jobWhen(job: EmailJob) {
  if (job.state === "sent" && job.sentAt) return { label: `Delivered ${formatRelative(job.sentAt)}`, at: job.sentAt };
  if (job.state === "retrying" && job.nextAttemptAt) return { label: `Next try ${formatRelative(job.nextAttemptAt)}`, at: job.nextAttemptAt };
  if (job.state === "queued") return { label: `Queued ${formatRelative(job.updatedAt)}`, at: job.updatedAt };
  return { label: `Last tried ${formatRelative(job.updatedAt)}`, at: job.updatedAt };
}

// ---- Summary ----

function SummaryTile({ label, value, hint, icon, tone, active, onClick }: { label: string; value: number; hint: string; icon: ReactNode; tone: "danger" | "warning" | "neutral"; active: boolean; onClick?: () => void }) {
  const highlighted = tone !== "neutral" && value > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? active : undefined}
      className={cn(
        "rounded-2xl border bg-card p-4 text-start shadow-xs transition-colors enabled:hover:border-primary/40",
        active && "border-primary ring-1 ring-primary",
        highlighted && tone === "danger" && "border-red-500/30 bg-red-500/5",
        highlighted && tone === "warning" && "border-amber-500/30 bg-amber-500/5",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {label}
        <span className={cn(highlighted && tone === "danger" && "text-red-600 dark:text-red-400", highlighted && tone === "warning" && "text-amber-600 dark:text-amber-400")}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{formatNumber(value)}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </button>
  );
}

function Summary({ counts, status, onStatus }: { counts: JobCounts; status: string; onStatus: (value: string) => void }) {
  const attention = counts.gaveUp + counts.stuck;
  const toggle = (value: string) => () => onStatus(status === value ? "" : value);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <SummaryTile
        label="Needs attention"
        value={attention}
        hint={attention ? `${counts.gaveUp} gave up · ${counts.stuck} stuck` : "Nothing is stuck"}
        icon={<TriangleAlert className="size-4" />}
        tone="danger"
        active={status === "attention"}
        onClick={toggle("attention")}
      />
      <SummaryTile label="Retrying" value={counts.retrying} hint="The worker tries again by itself" icon={<RotateCcw className="size-4" />} tone="warning" active={status === "retrying"} onClick={toggle("retrying")} />
      <SummaryTile label="Queued" value={counts.queued} hint="Waiting to send" icon={<Clock3 className="size-4" />} tone="neutral" active={status === "queued"} onClick={toggle("queued")} />
      <SummaryTile
        label="Delivered · 24h"
        value={counts.sent24h}
        hint={counts.failed24h ? `${counts.failed24h} had a failed attempt` : "No failed attempts"}
        icon={<MailCheck className="size-4" />}
        tone="neutral"
        active={status === "sent"}
        onClick={toggle("sent")}
      />
    </div>
  );
}

// ---- Dialogs ----

function NoteField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="retry-note">Note (optional)</Label>
      <Textarea id="retry-note" value={value} onChange={(event) => onChange(event.target.value)} placeholder="e.g. Email provider outage is resolved" maxLength={500} rows={2} />
      <p className="text-xs text-muted-foreground">Saved in the admin audit log.</p>
    </div>
  );
}

function MutationError({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      {error.message}
    </p>
  );
}

function JobDialog({ id, onClose, onDone }: { id: string | null; onClose: () => void; onDone: (message: string) => void }) {
  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">{id ? <JobDetails key={id} id={id} onClose={onClose} onDone={onDone} /> : null}</DialogContent>
    </Dialog>
  );
}

function JobDetails({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (message: string) => void }) {
  const job = useEmailJob(id);
  const retry = useRetryEmails();
  const canRetry = useCan("support");
  const [note, setNote] = useState("");

  if (job.isPending) return <Loading />;
  if (job.error) return <ErrorState error={job.error} onRetry={() => void job.refetch()} />;
  const j = job.data;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    retry.mutate(
      { id, reason: note },
      {
        onSuccess: () => {
          onDone(`Requeued the email to ${j.recipientEmail}.`);
          onClose();
        },
      },
    );
  };
  const retryable = j.state !== "sent" && j.state !== "queued";

  return (
    <form onSubmit={submit} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2 pe-8">
          <DialogTitle>{jobKindLabels[j.kind] ?? j.kind}</DialogTitle>
          <JobStateBadge state={j.state} />
        </div>
        <DialogDescription>
          To {j.recipientName ? `${j.recipientName} · ` : ""}
          {j.recipientEmail}
        </DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-muted/50 p-3 text-sm">
        <dt className="text-muted-foreground">Envelope</dt>
        <dd className="min-w-0">
          <Link to={`/envelopes/${j.envelopeId}`} className="block truncate font-medium hover:text-primary hover:underline" onClick={onClose}>
            {j.envelopeTitle}
          </Link>
        </dd>
        <dt className="text-muted-foreground">Workspace</dt>
        <dd className="min-w-0 truncate">{j.workspaceName}</dd>
        <dt className="text-muted-foreground">Attempts</dt>
        <dd className="tabular-nums">
          {j.attempts} of {j.maxAttempts}
          {j.nextAttemptAt ? <span className="text-muted-foreground"> · next {formatRelative(j.nextAttemptAt)}</span> : null}
        </dd>
        <dt className="text-muted-foreground">Created</dt>
        <dd>{formatDateTime(j.createdAt)}</dd>
      </dl>

      {j.lastError && j.state !== "sent" ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <p className="text-sm font-medium">Last error</p>
          <pre className="max-h-40 overflow-auto rounded-xl border border-red-500/20 bg-red-500/5 p-3 font-mono text-xs whitespace-pre-wrap text-red-800 dark:text-red-200">{j.lastError}</pre>
        </div>
      ) : null}

      {j.history.length ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <p className="text-sm font-medium">Delivery attempts</p>
          <ol className="divide-y rounded-xl border text-sm">
            {j.history.map((attempt) => (
              <li key={`${attempt.attempt}-${attempt.occurredAt}`} className="flex items-start gap-3 px-3 py-2">
                {attempt.status === "sent" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <X className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />}
                <div className="min-w-0 flex-1">
                  <p>
                    Attempt {attempt.attempt} {attempt.status === "sent" ? `delivered via ${attempt.provider}` : "failed"}
                  </p>
                  {attempt.error ? <p className="truncate text-xs text-muted-foreground" title={attempt.error}>{attempt.error}</p> : null}
                </div>
                <time className="shrink-0 text-xs text-muted-foreground" title={formatDateTime(attempt.occurredAt)}>
                  {formatRelative(attempt.occurredAt)}
                </time>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {j.adminActions.length ? (
        <p className="text-xs text-muted-foreground">
          Retried by {j.adminActions[0].adminName ?? j.adminActions[0].adminEmail ?? "an admin"} {formatRelative(j.adminActions[0].occurredAt)}
          {j.adminActions[0].reason ? ` · “${j.adminActions[0].reason}”` : ""}
        </p>
      ) : null}

      {retryable && canRetry && !j.retryBlocked ? <NoteField value={note} onChange={setNote} /> : null}
      {retryable && j.retryBlocked ? (
        <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {j.retryBlocked}
        </p>
      ) : null}
      <MutationError error={retry.error} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        {retryable && canRetry && !j.retryBlocked ? (
          <Button type="submit" disabled={retry.isPending}>
            {retry.isPending ? <LoaderCircle className="animate-spin" /> : <Send />}
            Retry now
          </Button>
        ) : null}
      </DialogFooter>
    </form>
  );
}

function RetryAllDialog({ open, count, onClose, onDone }: { open: boolean; count: number; onClose: () => void; onDone: (message: string) => void }) {
  const retry = useRetryEmails();
  const [note, setNote] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    retry.mutate(
      { reason: note },
      {
        onSuccess: (result) => {
          const { retried, skipped } = result as { retried: number; skipped: number };
          onDone(`Requeued ${retried} ${retried === 1 ? "email" : "emails"}${skipped ? `. Skipped ${skipped} that can't be retried; open them to see why` : ""}.`);
          onClose();
        },
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <DialogHeader>
            <DialogTitle>Retry stuck emails</DialogTitle>
            <DialogDescription>
              {count} {count === 1 ? "email has" : "emails have"} given up or got stuck. Each gets a fresh set of attempts and goes back in the queue. Emails whose signing link no longer works are skipped.
            </DialogDescription>
          </DialogHeader>
          <NoteField value={note} onChange={setNote} />
          <MutationError error={retry.error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={retry.isPending}>
              {retry.isPending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
              Retry {count === 1 ? "email" : "all"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Page ----

export function EmailQueuePage() {
  const params = useListParams();
  const jobs = useEmailJobs({ query: params.query, status: params.status, page: params.page });
  const canRetry = useCan("support");
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [retryAll, setRetryAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const counts = jobs.data?.counts;
  const attention = counts ? counts.gaveUp + counts.stuck : 0;
  const filtered = Boolean(params.query || params.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email queue"
        description="Signing invitations, reminders and notices: what's waiting, what failed and why. Refreshes every 15 seconds."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void jobs.refetch()} disabled={jobs.isFetching}>
              <RefreshCw className={cn(jobs.isFetching && "animate-spin")} /> Refresh
            </Button>
            {canRetry ? (
              <Button size="sm" onClick={() => setRetryAll(true)} disabled={attention === 0} title={attention === 0 ? "Nothing needs a retry" : undefined}>
                <RotateCcw /> Retry stuck{attention ? ` (${attention})` : ""}
              </Button>
            ) : null}
          </>
        }
      />

      {notice ? (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="flex-1 font-medium">{notice}</p>
          <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X />
          </Button>
        </div>
      ) : null}

      {counts ? <Summary counts={counts} status={params.status} onStatus={params.setStatus} /> : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchField value={params.draft} onChange={params.setDraft} placeholder="Search recipient email, envelope or ID" />
          <StatusFilter value={params.status} onChange={params.setStatus} options={filterOptions} />
        </div>

        {jobs.isPending ? (
          <Loading />
        ) : jobs.error ? (
          <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />
        ) : jobs.data.items.length === 0 ? (
          <EmptyState
            title={params.status === "attention" ? "Nothing needs attention" : filtered ? "No emails match" : "No emails yet"}
            description={params.status === "attention" ? "Every email was delivered or is still being retried automatically." : filtered ? "Try a different search or filter." : "Emails appear here once envelopes are sent."}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="ps-5">Email</TableHead>
                  <TableHead className="hidden md:table-cell">Envelope</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="hidden lg:table-cell">When</TableHead>
                  <TableHead className="w-10 pe-5" aria-label="Open" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.data.items.map((job) => {
                  const when = jobWhen(job);
                  const open = () => setOpenJob(job.id);
                  return (
                    <TableRow key={job.id} className="group cursor-pointer" tabIndex={0} onClick={open} onKeyDown={(event) => event.key === "Enter" && open()}>
                      <TableCell className="ps-5">
                        <div className="min-w-0 max-w-[15rem] sm:max-w-xs">
                          <p className="truncate font-medium">{job.recipientEmail}</p>
                          <p className="truncate text-xs text-muted-foreground">{jobKindLabels[job.kind] ?? job.kind}</p>
                          <div className="mt-1 sm:hidden">
                            <JobStateBadge state={job.state} />
                          </div>
                          {job.lastError && job.state !== "sent" ? (
                            <p className="mt-1 truncate font-mono text-[11px] text-red-700 dark:text-red-300" title={job.lastError}>
                              {job.lastError}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="min-w-0 max-w-[16rem]">
                          <p className="truncate">{job.envelopeTitle}</p>
                          <p className="truncate text-xs text-muted-foreground">{job.workspaceName}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <JobStateBadge state={job.state} />
                          {job.state !== "sent" && job.attempts > 0 ? (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {job.attempts}/{job.maxAttempts} tries
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell" title={formatDateTime(when.at)}>
                        {when.label}
                      </TableCell>
                      <TableCell className="pe-5 text-muted-foreground">
                        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination page={jobs.data.page} pageSize={jobs.data.pageSize} total={jobs.data.total} onPage={params.setPage} />
          </>
        )}
      </Card>

      <JobDialog id={openJob} onClose={() => setOpenJob(null)} onDone={setNotice} />
      <RetryAllDialog open={retryAll} count={attention} onClose={() => setRetryAll(false)} onDone={setNotice} />
    </div>
  );
}
