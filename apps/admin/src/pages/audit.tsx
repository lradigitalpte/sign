import { Building2, ChevronDown, CircleDollarSign, FileText, Flag, Mail, Megaphone, ShieldCheck, Terminal, Trash2, UserRound, Webhook, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import { cn } from "@signet/ui/lib/utils";

import { InitialAvatar } from "@/components/initial-avatar";
import { Card, EmptyState, ErrorState, Loading, PageHeader, Pagination, SearchField } from "@/components/page";
import { StatusFilter } from "@/components/status-filter";
import { useAdmins, useAudit } from "@/lib/api";
import { formatDateTime, formatNumber, formatRelative, planLabels, roleLabels } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";
import { useListParams } from "@/lib/use-list-params";

const targetOptions = [
  { value: "", label: "All" },
  { value: "workspace", label: "Workspaces" },
  { value: "user", label: "Users" },
  { value: "envelope", label: "Envelopes" },
  { value: "job", label: "Emails" },
  { value: "admin", label: "Admins" },
  { value: "flag", label: "Flags" },
  { value: "webhook", label: "Webhooks" },
  { value: "announcement", label: "Announcements" },
  { value: "deletion", label: "Deletions" },
  { value: "plan", label: "Plan prices" },
];

const targetIcons = { workspace: Building2, user: UserRound, envelope: FileText, job: Mail, admin: ShieldCheck, flag: Flag, webhook: Webhook, announcement: Megaphone, deletion: Trash2, plan: CircleDollarSign };

/** "suspended workspace", "resent signing emails for envelope"…, followed by the target's name. */
function actionPhrase(entry: AuditEntry) {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  switch (entry.action) {
    case "workspace.suspend":
      return "suspended workspace";
    case "workspace.unsuspend":
      return "restored workspace";
    case "workspace.member_role":
      return `changed ${memberName(after)} from ${roleLabel(before.role)} to ${roleLabel(after.role)} in`;
    case "workspace.member_remove":
      return `removed ${memberName(before)} from`;
    case "workspace.invitation_resend":
      return `resent the invitation for ${String(after.email ?? "someone")} to`;
    case "user.suspend":
      return "suspended";
    case "user.unsuspend":
      return "restored";
    case "envelope.resend":
      return "resent signing emails for";
    case "envelope.extend":
      return after.status === "in_progress" && before.status === "expired" ? "reopened and extended" : "extended";
    case "envelope.void":
      return "voided";
    case "job.retry":
      return "retried the email to";
    case "job.retry_all":
      return `retried ${formatNumber(Number(after.retried ?? 0))} stuck emails`;
    case "admin.grant":
      return entry.before ? `changed the admin role (${roleLabel(before.role)} → ${roleLabel(after.role)}) of` : `gave ${roleLabel(after.role)} access to`;
    case "admin.revoke":
      return "removed admin access from";
    case "workspace.rename":
      return `renamed "${String(before.name ?? "")}" to`;
    case "user.deletion_cancel":
      return "canceled the account deletion of";
    case "user.deletion_run":
      return "deleted, without waiting for the grace period, the account of";
    case "workspace.plan":
      return `changed the plan (${planLabel(before.plan)} → ${planLabel(after.plan)}) of`;
    case "flag.create":
      return "created the feature flag";
    case "flag.default":
      return `turned ${after.enabled ? "on" : "off"} for everyone the flag`;
    case "flag.override":
      return after.override === null ? "removed a workspace's setting for" : `set a workspace ${after.override ? "on" : "off"} for`;
    case "flag.delete":
      return "deleted the feature flag";
    case "webhook.reprocess":
      return "reprocessed the webhook event";
    case "envelope.document_view":
      return `opened ${after.version === "signed" ? "the signed copy of " : ""}${String(after.filename ?? "a document")} (with the customer's permission) in`;
    case "deletion.cancel":
      return "canceled the scheduled deletion of";
    case "deletion.run":
      return "deleted, without waiting for the grace period,";
    case "announcement.create":
      return "published the announcement";
    case "announcement.update":
      return "edited the announcement";
    case "announcement.end":
      return "ended the announcement";
    case "plan.price":
      return "changed the price of";
    default:
      return entry.action;
  }
}

/** Entries from before emails were recorded only have the member's ID. */
const memberName = (values: Record<string, unknown>) => (typeof values.email === "string" ? values.email : "a member");

const planLabel = (value: unknown) => (typeof value === "string" ? (planLabels[value] ?? value) : "Free");

const roleLabel = (value: unknown) => (typeof value === "string" ? (roleLabels[value] ?? value).toLowerCase() : "unknown");

function targetHref(entry: AuditEntry) {
  switch (entry.targetType) {
    case "workspace":
      return `/workspaces/${entry.targetId}`;
    case "user":
    case "admin":
      return `/users/${entry.targetId}`;
    case "envelope":
      return `/envelopes/${entry.targetId}`;
    case "job":
      return entry.targetId === "all" ? null : `/email-queue?query=${entry.targetId}`;
    case "flag":
      return "/flags";
    case "webhook":
      return `/webhooks?query=${entry.targetId}`;
    case "announcement":
      return "/announcements";
    case "deletion":
      return "/deletions";
    case "plan":
      return "/billing";
  }
}

function TargetName({ entry }: { entry: AuditEntry }) {
  if (entry.action === "job.retry_all") return null;
  const href = targetHref(entry);
  const label = entry.targetLabel ?? `${entry.targetType} ${entry.targetId.slice(0, 8)} (deleted)`;
  return href && entry.targetLabel ? (
    <Link to={href} className="font-medium text-foreground hover:text-primary hover:underline">
      {label}
    </Link>
  ) : (
    <span className="font-medium text-foreground">{label}</span>
  );
}

// ---- Change details ----

const isoDate = /^\d{4}-\d{2}-\d{2}T/;

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (key === "jobIds" && Array.isArray(value)) return `${value.length} emails`;
  if (key === "role" && typeof value === "string") return roleLabels[value] ?? value;
  if (typeof value === "string" && isoDate.test(value)) return formatDateTime(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const keyLabels: Record<string, string> = {
  status: "Status",
  expiresAt: "Expires",
  suspended: "Suspended",
  reason: "Earlier reason",
  role: "Role",
  userId: "Member",
  reminders: "Reminders queued",
  attempts: "Attempts",
  state: "State",
  retried: "Retried",
  skipped: "Skipped",
  jobIds: "Emails",
  invitationId: "Invitation",
  email: "Email",
  emailSent: "Email sent",
  plan: "Plan",
  seats: "Seats",
  billingCycle: "Billing",
  periodEndsAt: "Renews or ends",
  enabled: "On",
  override: "Workspace setting",
  workspaceId: "Workspace",
  description: "Description",
  eventType: "Event",
  outcome: "Outcome",
  error: "Error",
  filename: "File",
  version: "Version",
  grantId: "Access grant",
  title: "Title",
  severity: "Severity",
  plans: "Plans",
  startsAt: "Starts",
  endsAt: "Ends",
  workspace: "Workspace",
  name: "Name",
  syncedToWorkOS: "Changed in WorkOS",
};

function Changes({ entry }: { entry: AuditEntry }) {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  if (keys.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 text-start font-medium">Field</th>
            <th className="px-3 py-1.5 text-start font-medium">Before</th>
            <th className="px-3 py-1.5 text-start font-medium">After</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {keys.map((key) => (
            <tr key={key}>
              <td className="px-3 py-1.5 text-muted-foreground">{keyLabels[key] ?? key}</td>
              <td className="px-3 py-1.5 break-all">{key in before ? formatValue(key, before[key]) : "—"}</td>
              <td className="px-3 py-1.5 break-all">{key in after ? formatValue(key, after[key]) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Entry({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const Icon = targetIcons[entry.targetType] ?? ShieldCheck;
  const adminName = entry.adminName ?? entry.adminEmail;
  return (
    <li className="px-5 py-4">
      <div className="flex gap-3">
        {adminName ? (
          <InitialAvatar name={adminName} seed={entry.adminUserId ?? adminName} size="sm" />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground" title="Command line">
            <Terminal className="size-3.5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{adminName ?? "Command line"}</span> {actionPhrase(entry)} <TargetName entry={entry} />
            </p>
            <time className="shrink-0 text-xs text-muted-foreground tabular-nums" dateTime={entry.occurredAt} title={formatDateTime(entry.occurredAt)}>
              {formatRelative(entry.occurredAt)}
            </time>
          </div>
          {entry.reason ? <p className="mt-1.5 rounded-lg bg-muted/50 px-3 py-2 text-sm">“{entry.reason}”</p> : null}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Icon className="size-3.5" />
            Details
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </button>
          {open ? (
            <div className="mt-2 grid gap-3">
              <Changes entry={entry} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">When</dt>
                <dd>{formatDateTime(entry.occurredAt)}</dd>
                <dt className="text-muted-foreground">Target</dt>
                <dd className="font-mono break-all">
                  {entry.targetType} · {entry.targetId}
                </dd>
                <dt className="text-muted-foreground">IP address</dt>
                <dd className="font-mono">{entry.ipAddress ?? "—"}</dd>
                <dt className="text-muted-foreground">Browser</dt>
                <dd className="break-words">{entry.userAgent ?? "—"}</dd>
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

// ---- Page ----

function FilterChip({ label, children, onClear }: { label: string; children: ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/50 py-0.5 ps-3 pe-1 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="truncate font-medium">{children}</span>
      <button type="button" aria-label={`Clear ${label.toLowerCase()} filter`} className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClear}>
        <X className="size-3.5" />
      </button>
    </span>
  );
}

export function AuditPage() {
  const params = useListParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const adminId = searchParams.get("adminId") ?? "";
  const targetId = searchParams.get("targetId") ?? "";
  const audit = useAudit({ query: params.query, targetType: params.status, adminId, targetId, page: params.page });
  const admins = useAdmins();
  const adminName = admins.data?.find((a) => a.userId === adminId)?.name ?? "…";
  const clear = (key: string) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete(key);
      next.delete("page");
      return next;
    });
  const total = audit.data?.total;
  const filtered = Boolean(params.query || params.status || adminId || targetId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description={
          total === undefined
            ? "Every change made in this app."
            : `${formatNumber(total)} ${total === 1 ? "action" : "actions"}${filtered ? " match" : ""} · newest first · entries can't be edited or deleted`
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <SearchField value={params.draft} onChange={params.setDraft} placeholder="Search reason, admin, name or ID" />
            {adminId ? (
              <FilterChip label="Admin" onClear={() => clear("adminId")}>
                {adminName}
              </FilterChip>
            ) : null}
            {targetId ? (
              <FilterChip label="Target" onClear={() => clear("targetId")}>
                {audit.data?.items[0]?.targetLabel ?? `${targetId.slice(0, 8)}…`}
              </FilterChip>
            ) : null}
          </div>
          <StatusFilter value={params.status} onChange={params.setStatus} options={targetOptions} />
        </div>

        {audit.isPending ? (
          <Loading />
        ) : audit.error ? (
          <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
        ) : audit.data.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No matching actions" : "No admin actions yet"}
            description={filtered ? "Try a different search or filter." : "Suspensions, resends, retries and access changes will show up here."}
          />
        ) : (
          <>
            <ol className="divide-y">
              {audit.data.items.map((entry) => (
                <Entry key={entry.id} entry={entry} />
              ))}
            </ol>
            <Pagination page={audit.data.page} pageSize={audit.data.pageSize} total={audit.data.total} onPage={params.setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
