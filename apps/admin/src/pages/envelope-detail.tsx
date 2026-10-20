import { ArrowLeft, Ban, Building2, CalendarClock, CheckCircle2, CircleAlert, Eye, FileText, History, Hourglass, Mail, Send, ShieldCheck, UserRound, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";

import { Button } from "@signet/ui/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@signet/ui/components/table";
import { cn } from "@signet/ui/lib/utils";

import { useCan } from "@/lib/admin-context";
import { CopyButton } from "@/components/copy-button";
import { EnvelopeActionDialog, type EnvelopeActionKind } from "@/components/envelope-action-dialog";
import { InitialAvatar } from "@/components/initial-avatar";
import { Badge, Card, CardHeader, DetailRow, EmptyState, EnvelopeStatusBadge, ErrorState, Loading, PageHeader } from "@/components/page";
import { ApiError, useEnvelope, useOpenDocument } from "@/lib/api";
import { formatBytes, formatDate, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import type { EnvelopeDetail, EnvelopeEvent, EnvelopeJob, EnvelopeRecipient } from "@/lib/types";

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}

function Figure({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`;

// ---- Recipients ----

const recipientRoleLabels: Record<EnvelopeRecipient["role"], string> = { signer: "Signer", approver: "Approver", viewer: "Viewer", cc: "Gets a copy" };

function RecipientStatus({ recipient }: { recipient: EnvelopeRecipient }) {
  switch (recipient.status) {
    case "completed":
      return <Badge tone="success">{recipient.role === "approver" ? "Approved" : recipient.role === "signer" ? "Signed" : "Done"}</Badge>;
    case "declined":
      return <Badge tone="danger">Declined</Badge>;
    case "viewed":
      return <Badge tone="warning">Opened</Badge>;
    case "sent":
      return <Badge tone="info">Sent</Badge>;
    default:
      return <Badge>Not sent yet</Badge>;
  }
}

function recipientActivity(recipient: EnvelopeRecipient) {
  const latest = [
    { at: recipient.declinedAt, label: "Declined" },
    { at: recipient.completedAt, label: "Finished" },
    { at: recipient.viewedAt, label: "Opened" },
    { at: recipient.lastRemindedAt, label: "Reminded" },
    { at: recipient.sentAt, label: "Sent" },
  ].find((item) => item.at);
  return latest?.at ? { label: latest.label, at: latest.at } : null;
}

function RecipientsCard({ envelope }: { envelope: EnvelopeDetail }) {
  const sequential = new Set(envelope.recipients.map((r) => r.signingOrder)).size > 1;
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Recipients" description={sequential ? `${plural(envelope.recipients.length, "person", "people")} · signing in order` : plural(envelope.recipients.length, "person", "people")} />
      {envelope.recipients.length === 0 ? (
        <EmptyState title="No recipients yet" />
      ) : (
        <Table>
          <TableBody>
            {envelope.recipients.map((recipient) => {
              const activity = recipientActivity(recipient);
              return (
                <TableRow key={recipient.id}>
                  <TableCell className="ps-5">
                    <div className="flex max-w-[11rem] items-center gap-3 sm:max-w-none">
                      {sequential ? <span className="w-4 text-center text-xs font-medium text-muted-foreground tabular-nums">{recipient.signingOrder}</span> : null}
                      <InitialAvatar name={recipient.name || recipient.email} seed={recipient.email} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{recipient.name || recipient.email}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {recipient.email} · {recipientRoleLabels[recipient.role]}
                        </p>
                        {recipient.declineReason ? <p className="mt-1 text-xs text-red-700 dark:text-red-300">“{recipient.declineReason}”</p> : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RecipientStatus recipient={recipient} />
                  </TableCell>
                  <TableCell className="hidden pe-5 text-end text-muted-foreground sm:table-cell" title={activity ? formatDateTime(activity.at) : undefined}>
                    {activity ? `${activity.label} ${formatRelative(activity.at)}` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

// ---- Timeline ----

const jobKindLabels: Record<string, string> = {
  invitation: "Invitation",
  reminder: "Reminder",
  completion: "Signed copy",
  sender_viewed: "Opened notice",
  sender_signed: "Signed notice",
};

const eventLabels: Record<string, string> = {
  "envelope.sent": "Sent to recipients",
  "envelope.viewed": "Document opened",
  "envelope.completed": "All signatures collected",
  "envelope.voided": "Envelope voided",
  "envelope.advanced": "Next recipient invited",
  "envelope.reminded": "Reminder sent",
  "envelope.expired": "Envelope expired",
  "envelope.extended": "Expiration extended",
  "envelope.support_viewed": "Document opened by Signet support",
  "recipient.completed": "Recipient signed",
  "recipient.approved": "Recipient approved",
  "recipient.declined": "Recipient declined",
  "recipient.passcode_failed": "Wrong passcode entered",
  "recipient.passcode_verified": "Passcode verified",
  "document.finalized": "Signed document sealed",
  "envelope.duplicated": "Copied from another envelope",
};

/** "reminder.delivered" → "Reminder email delivered". */
function eventLabel(type: string) {
  if (eventLabels[type]) return eventLabels[type];
  const [kind, outcome] = type.split(".");
  if (outcome === "delivered" || outcome === "failed") return `${jobKindLabels[kind] ?? kind} email ${outcome}`;
  return type.replaceAll(".", " · ").replaceAll("_", " ");
}

function eventIcon(type: string) {
  if (type === "envelope.voided" || type === "recipient.declined") return Ban;
  if (type === "envelope.expired") return Hourglass;
  if (type === "envelope.extended") return CalendarClock;
  if (type === "envelope.support_viewed") return Eye;
  if (type === "envelope.reminded" || type === "envelope.sent" || type === "envelope.advanced") return Send;
  if (type === "envelope.completed" || type === "document.finalized") return ShieldCheck;
  if (type.endsWith(".delivered")) return Mail;
  if (type.endsWith(".failed")) return CircleAlert;
  if (type.startsWith("recipient.")) return CheckCircle2;
  return History;
}

function eventActor(event: EnvelopeEvent) {
  if (event.metadata.support === true) return "Signet support";
  return event.actorName ?? event.recipientName ?? (event.metadata.automatic === true ? "Automatic" : "System");
}

type TimelineItem = EnvelopeEvent & { count: number };

/** Back-to-back repeats of the same event by the same person become one row ("Document opened ×4"). */
function collapseRepeats(events: EnvelopeEvent[]) {
  const items: TimelineItem[] = [];
  for (const event of events) {
    const previous = items[items.length - 1];
    if (previous && previous.type === event.type && eventActor(previous) === eventActor(event)) previous.count += 1;
    else items.push({ ...event, count: 1 });
  }
  return items;
}

function TimelineCard({ events: raw }: { events: EnvelopeEvent[] }) {
  const events = collapseRepeats(raw);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Timeline" description="What the sender sees in their audit trail, newest first" />
      {events.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Nothing has happened yet.</p>
      ) : (
        <ol className="px-5 py-4">
          {events.map((event, index) => {
            const Icon = eventIcon(event.type);
            const support = event.metadata.support === true;
            return (
              <li key={event.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border", support ? "border-primary/30 bg-primary/10 text-primary" : "bg-card text-muted-foreground")}>
                    <Icon className="size-3.5" />
                  </span>
                  {index < events.length - 1 ? <span className="my-1 w-px flex-1 bg-border" /> : null}
                </div>
                <div className={cn("min-w-0 flex-1 pt-1", index < events.length - 1 && "pb-4")}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-medium">
                      {eventLabel(event.type)}
                      {event.count > 1 ? <span className="ms-1.5 text-xs font-normal text-muted-foreground">×{event.count}</span> : null}
                    </p>
                    <time className="text-xs text-muted-foreground tabular-nums" dateTime={event.occurredAt} title={formatDateTime(event.occurredAt)}>
                      {formatRelative(event.occurredAt)}
                    </time>
                  </div>
                  <p className="text-xs text-muted-foreground">{eventActor(event)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

// ---- Emails ----

function JobStatus({ job }: { job: EnvelopeJob }) {
  if (job.status === "sent") return <Badge tone="success">Delivered</Badge>;
  if (job.status === "failed") return <Badge tone="danger">Failed</Badge>;
  if (job.status === "processing") return <Badge tone="info">Sending</Badge>;
  return <Badge tone="warning">Queued</Badge>;
}

function EmailsCard({ jobs }: { jobs: EnvelopeJob[] }) {
  const failed = jobs.filter((job) => job.status === "failed").length;
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Emails" description={failed ? `${plural(failed, "failed email", "failed emails")} · retried automatically` : "Every email this envelope has sent, newest first"} />
      {jobs.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6 text-sm text-muted-foreground">
          <Mail className="size-4" /> No emails yet.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="ps-5">To</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden pe-5 text-end sm:table-cell">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="ps-5">
                  <p className="max-w-44 truncate font-medium sm:max-w-56">{job.recipientEmail}</p>
                  <p className="text-xs text-muted-foreground sm:hidden">{jobKindLabels[job.kind] ?? job.kind}</p>
                  {job.lastError && job.status !== "sent" ? (
                    <p className="mt-0.5 max-w-72 truncate text-xs text-red-700 dark:text-red-300" title={job.lastError}>
                      {job.lastError}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{jobKindLabels[job.kind] ?? job.kind}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <JobStatus job={job} />
                    {job.attempts > 1 ? <span className="text-xs text-muted-foreground">{job.attempts} tries</span> : null}
                  </div>
                </TableCell>
                <TableCell className="hidden pe-5 text-end text-muted-foreground sm:table-cell" title={formatDateTime(job.sentAt ?? job.createdAt)}>
                  {formatRelative(job.sentAt ?? job.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

// ---- Side panels ----

const adminActionLabels: Record<string, string> = { "envelope.resend": "Resent emails", "envelope.extend": "Extended expiration", "envelope.void": "Voided" };

function SupportActionsCard({ envelope }: { envelope: EnvelopeDetail }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4 text-muted-foreground" /> Support actions
        </h2>
        {envelope.adminActions.length ? (
          <Link to={`/audit?targetId=${envelope.id}`} className="text-xs font-medium text-primary hover:underline">
            Audit log
          </Link>
        ) : null}
      </div>
      {envelope.adminActions.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No admin has changed this envelope.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {envelope.adminActions.map((action) => (
            <li key={action.id} className="rounded-xl bg-muted/50 p-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{adminActionLabels[action.action] ?? action.action}</span>
                <time className="shrink-0 text-xs text-muted-foreground" title={formatDateTime(action.occurredAt)}>
                  {formatRelative(action.occurredAt)}
                </time>
              </div>
              <p className="text-xs text-muted-foreground">by {action.adminName ?? action.adminEmail ?? "a removed admin"}</p>
              {action.reason ? <p className="mt-1.5 text-sm">{action.reason}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DetailsCard({ envelope }: { envelope: EnvelopeDetail }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold">Details</h2>
      <dl className="mt-2 divide-y">
        <DetailRow label="Delivery">{envelope.distributionMethod === "email" ? "Email" : "Shared link"}</DetailRow>
        <DetailRow label="Automatic reminders">{envelope.autoReminders ? "On" : "Off"}</DetailRow>
        <DetailRow label="Passcode">{envelope.requirePasscode ? "Required" : "Not required"}</DetailRow>
        <DetailRow label="Created">{formatDateTime(envelope.createdAt)}</DetailRow>
        {envelope.sentAt ? <DetailRow label="Sent">{formatDateTime(envelope.sentAt)}</DetailRow> : null}
        {envelope.completedAt ? <DetailRow label="Completed">{formatDateTime(envelope.completedAt)}</DetailRow> : null}
        <DetailRow label="Language">{envelope.language.toUpperCase()}</DetailRow>
        <DetailRow label="Time zone">{envelope.timezone}</DetailRow>
        {envelope.externalId ? <DetailRow label="External ID">{envelope.externalId}</DetailRow> : null}
      </dl>
    </Card>
  );
}

function DocumentsCard({ envelope }: { envelope: EnvelopeDetail }) {
  const canOpen = useCan("support") && envelope.supportAccessUntil !== null;
  const openDocument = useOpenDocument();
  const [error, setError] = useState<string | null>(null);
  const open = (documentId: string, signed: boolean) => {
    setError(null);
    openDocument(envelope.id, documentId, signed).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Couldn't open the document."));
  };
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <FileText className="size-4 text-muted-foreground" /> Documents
      </h2>
      {envelope.documents.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No documents uploaded.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {envelope.documents.map((document) => (
            <li key={document.id} className="rounded-xl bg-muted/50 p-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate font-medium" title={document.filename}>
                  {document.filename}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {plural(document.pageCount, "page", "pages")} · {formatBytes(document.sizeBytes)}
                </span>
              </div>
              {canOpen ? (
                <div className="mt-2 flex gap-1.5">
                  <Button variant="outline" size="xs" onClick={() => open(document.id, false)}>
                    <Eye /> Open
                  </Button>
                  {envelope.status === "completed" ? (
                    <Button variant="outline" size="xs" onClick={() => open(document.id, true)}>
                      <ShieldCheck /> Signed copy
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      <p className="mt-3 text-xs text-muted-foreground">
        {envelope.supportAccessUntil
          ? `The customer allowed support access until ${formatDateTime(envelope.supportAccessUntil)}. Every view is shown in their audit trail.`
          : "Contents stay private unless the customer allows support access (Settings → Data & privacy)."}
      </p>
    </Card>
  );
}

// ---- Page ----

function expiryText(envelope: EnvelopeDetail) {
  if (!envelope.expiresAt) return "No expiration";
  const past = new Date(envelope.expiresAt).getTime() < Date.now();
  return `${past ? "Expired" : "Expires"} ${formatRelative(envelope.expiresAt)}`;
}

export function EnvelopeDetailPage() {
  const { id = "" } = useParams();
  const envelope = useEnvelope(id);
  const canSupport = useCan("support");
  const canVoid = useCan("super_admin");
  const [dialog, setDialog] = useState<EnvelopeActionKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const back = (
    <Link to="/envelopes" className="inline-flex items-center gap-1.5 hover:text-foreground">
      <ArrowLeft className="size-4" /> Envelopes
    </Link>
  );

  if (envelope.isPending) return <Loading />;
  if (envelope.error) {
    const missing = envelope.error instanceof ApiError && envelope.error.status === 404;
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={back} title={missing ? "Envelope not found" : "Envelope"} />
        <Card>{missing ? <EmptyState title="No envelope with this ID" /> : <ErrorState error={envelope.error} onRetry={() => void envelope.refetch()} />}</Card>
      </div>
    );
  }

  const e = envelope.data;
  const waiting = e.recipients.filter((r) => r.role !== "cc" && (r.status === "sent" || r.status === "viewed")).length;
  const delivered = e.jobs.filter((job) => job.status === "sent").length;
  const failed = e.jobs.filter((job) => job.status === "failed").length;
  const pages = e.documents.reduce((sum, document) => sum + document.pageCount, 0);
  const active = e.status === "in_progress";
  const extendable = !e.isTemplate && (e.status === "expired" || (active && e.expiresAt !== null));

  const actions = [
    canSupport && active ? (
      <Button key="resend" variant="outline" size="sm" onClick={() => setDialog("resend")} disabled={waiting === 0} title={waiting === 0 ? "Nobody is waiting to sign" : undefined}>
        <Send /> Resend
      </Button>
    ) : null,
    canSupport && extendable ? (
      <Button key="extend" variant="outline" size="sm" onClick={() => setDialog("extend")}>
        <CalendarClock /> {e.status === "expired" ? "Reopen" : "Extend"}
      </Button>
    ) : null,
    canVoid && active ? (
      <Button key="void" variant="destructive" size="sm" onClick={() => setDialog("void")}>
        <Ban /> Void
      </Button>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">{back}</div>

      {notice ? (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="flex-1 font-medium">{notice}</p>
          <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X />
          </Button>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-start">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{e.title}</h1>
              <EnvelopeStatusBadge status={e.status} />
              {e.isTemplate ? <Badge>Template</Badge> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <Meta icon={<Building2 className="size-4" />}>
                <Link to={`/workspaces/${e.workspaceId}`} className="hover:text-foreground hover:underline">
                  {e.workspaceName}
                </Link>
              </Meta>
              <Meta icon={<UserRound className="size-4" />}>
                <span title={e.senderEmail}>From {e.senderName}</span>
              </Meta>
              <Meta icon={<Hourglass className="size-4" />}>
                <span title={e.expiresAt ? formatDateTime(e.expiresAt) : undefined}>{expiryText(e)}</span>
              </Meta>
              <Meta icon={<span className="font-mono text-xs">ID</span>}>
                <span className="font-mono text-xs">{e.id.slice(0, 8)}…</span>
                <CopyButton value={e.id} label="Copy envelope ID" />
              </Meta>
            </div>
          </div>
          {actions.length ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        <div className="grid grid-cols-2 divide-x border-t sm:grid-cols-4">
          <Figure label="Signed" value={`${formatNumber(e.completedCount)}/${formatNumber(e.recipientCount)}`} hint={waiting ? `${waiting} waiting` : undefined} />
          <Figure label="Documents" value={formatNumber(e.documents.length)} hint={pages ? plural(pages, "page", "pages") : undefined} />
          <Figure label="Emails delivered" value={formatNumber(delivered)} />
          <Figure label="Emails failed" value={<span className={cn(failed > 0 && "text-red-600 dark:text-red-400")}>{formatNumber(failed)}</span>} />
        </div>
      </Card>

      {e.status === "expired" ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <Hourglass className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            <span className="font-medium">This envelope expired{e.expiresAt ? ` on ${formatDate(e.expiresAt)}` : ""}.</span>{" "}
            <span className="text-muted-foreground">{canSupport ? "Reopen it to give recipients more time." : "A support admin can reopen it."}</span>
          </p>
        </div>
      ) : null}
      {failed > 0 ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
          <p>
            <span className="font-medium">{plural(failed, "email", "emails")} couldn&apos;t be delivered.</span>{" "}
            <span className="text-muted-foreground">The worker keeps retrying; the error is shown under each email below.</span>
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <RecipientsCard envelope={e} />
          <TimelineCard events={e.events} />
          <EmailsCard jobs={e.jobs} />
        </div>
        <div className="space-y-6">
          <SupportActionsCard envelope={e} />
          <DetailsCard envelope={e} />
          <DocumentsCard envelope={e} />
        </div>
      </div>

      <EnvelopeActionDialog envelope={e} kind={dialog} onClose={() => setDialog(null)} onDone={setNotice} />
    </div>
  );
}
