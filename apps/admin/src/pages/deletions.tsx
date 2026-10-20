import { Play, Trash2, Undo2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "@signet/ui/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@signet/ui/components/table";

import { ActionDialog, Notice, type ActionSpec } from "@/components/action-dialog";
import { useCan } from "@/lib/admin-context";
import { Badge, Card, ErrorState, Loading, PageHeader, Pagination } from "@/components/page";
import { StatusFilter } from "@/components/status-filter";
import { useAccountDeletions, useDeletions } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import type { AccountDeletionRequest, DeletionRequest } from "@/lib/types";
import { useListParams } from "@/lib/use-list-params";

// The default view (no status in the URL) is what still needs to happen.
const filterOptions = [
  { value: "", label: "Scheduled" },
  { value: "completed", label: "Deleted" },
  { value: "canceled", label: "Canceled" },
  { value: "all", label: "All" },
];

const kindOptions = [
  { value: "", label: "Workspaces" },
  { value: "accounts", label: "Accounts" },
];

type Request = { status: DeletionRequest["status"]; scheduledFor: string; canceledAt: string | null; completedAt: string | null };

function StatusBadge({ request }: { request: Request }) {
  switch (request.status) {
    case "scheduled":
      return <Badge tone="warning">Scheduled</Badge>;
    case "failed":
      return <Badge tone="danger">Failed, retrying</Badge>;
    case "completed":
      return <Badge>Deleted</Badge>;
    default:
      return <Badge tone="success">Canceled</Badge>;
  }
}

function whenText(request: Request) {
  if (request.status === "completed" && request.completedAt) return `Deleted ${formatRelative(request.completedAt)}`;
  if (request.status === "canceled" && request.canceledAt) return `Canceled ${formatRelative(request.canceledAt)}`;
  const due = new Date(request.scheduledFor).getTime() <= Date.now();
  return due ? "Due now" : `Deletes ${formatRelative(request.scheduledFor)}`;
}

const isOpen = (request: Request) => request.status === "scheduled" || request.status === "failed";

// ---- Workspace specs ----

function cancelWorkspaceSpec(request: DeletionRequest): ActionSpec {
  return {
    title: `Keep ${request.organizationName}?`,
    description: "The deletion is canceled and nothing is removed. The owner sees that the workspace is no longer scheduled for deletion.",
    confirmLabel: "Cancel deletion",
    reasonPlaceholder: "e.g. Owner emailed support asking to keep the workspace",
    request: (reason) => ({ method: "POST", path: `/deletions/${encodeURIComponent(request.id)}/cancel`, body: { reason } }),
    success: () => `${request.organizationName} will be kept.`,
  };
}

function runWorkspaceSpec(request: DeletionRequest): ActionSpec<DeletionRequest> {
  return {
    title: `Delete ${request.organizationName} now?`,
    description: `Everything in the workspace, including every document and file in storage, is permanently deleted now instead of on ${formatDate(request.scheduledFor)}. This can't be undone.`,
    confirmLabel: "Delete permanently",
    destructive: true,
    reasonPlaceholder: "e.g. Owner confirmed by email they want it gone today",
    request: (reason) => ({ method: "POST", path: `/deletions/${encodeURIComponent(request.id)}/run`, body: { reason } }),
    success: (done) => `Deleted ${done.organizationName}: ${formatNumber(done.envelopesDeleted ?? 0)} envelopes and ${formatNumber(done.filesDeleted ?? 0)} files.`,
  };
}

// ---- Account specs ----

function cancelAccountSpec(request: AccountDeletionRequest): ActionSpec {
  return {
    title: `Keep ${request.userEmail}'s account?`,
    description: "The deletion is canceled and nothing is removed.",
    confirmLabel: "Cancel deletion",
    reasonPlaceholder: "e.g. They changed their mind and emailed support",
    request: (reason) => ({ method: "POST", path: `/account-deletions/${encodeURIComponent(request.id)}/cancel`, body: { reason } }),
    success: () => `${request.userEmail}'s account will be kept.`,
  };
}

function runAccountSpec(request: AccountDeletionRequest): ActionSpec<AccountDeletionRequest> {
  return {
    title: `Delete ${request.userEmail}'s account now?`,
    description: `Workspaces only they use are deleted with everything in them, they're removed from the rest, their profile is anonymized and their WorkOS login is deleted, now instead of on ${formatDate(request.scheduledFor)}. This can't be undone.`,
    confirmLabel: "Delete permanently",
    destructive: true,
    reasonPlaceholder: "e.g. Confirmed by email they want it gone today",
    request: (reason) => ({ method: "POST", path: `/account-deletions/${encodeURIComponent(request.id)}/run`, body: { reason } }),
    success: (done) => `Deleted the account and ${formatNumber(done.workspacesDeleted ?? 0)} ${done.workspacesDeleted === 1 ? "workspace" : "workspaces"}.${done.warning ? ` Note: ${done.warning}` : ""}`,
  };
}

// ---- Tables ----

function Empty({ text, hint }: { text: string; hint: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Trash2 className="size-5" />
      </span>
      <p className="mt-4 font-medium">{text}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function Actions({ show, onKeep, onRun }: { show: boolean; onKeep: () => void; onRun: () => void }) {
  if (!show) return null;
  return (
    <div className="flex justify-end gap-1.5">
      <Button variant="outline" size="sm" onClick={onKeep}>
        <Undo2 /> Keep
      </Button>
      <Button variant="destructive" size="sm" onClick={onRun}>
        <Play /> Delete now
      </Button>
    </div>
  );
}

function Header({ first }: { first: ReactNode }) {
  return (
    <TableHeader>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableHead className="ps-5">{first}</TableHead>
        <TableHead className="hidden md:table-cell">Requested</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="hidden sm:table-cell">When</TableHead>
        <TableHead className="pe-5 text-end" aria-label="Actions" />
      </TableRow>
    </TableHeader>
  );
}

function WorkspaceDeletions({ status, page, onPage, onSpec }: { status: string; page: number; onPage: (page: number) => void; onSpec: (spec: ActionSpec<never>) => void }) {
  const deletions = useDeletions({ status, page });
  const canManage = useCan("super_admin");
  if (deletions.isPending) return <Loading />;
  if (deletions.error) return <ErrorState error={deletions.error} onRetry={() => void deletions.refetch()} />;
  if (deletions.data.items.length === 0) {
    return <Empty text={status === "open" ? "No workspaces scheduled for deletion" : "Nothing here"} hint="Owners request deletion in Settings → Data & privacy." />;
  }
  return (
    <>
      <Table>
        <Header first="Workspace" />
        <TableBody>
          {deletions.data.items.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="ps-5">
                {request.organizationId ? (
                  <Link to={`/workspaces/${request.organizationId}`} className="font-medium hover:text-primary hover:underline">
                    {request.organizationName}
                  </Link>
                ) : (
                  <span className="font-medium">{request.organizationName}</span>
                )}
                {request.status === "completed" ? (
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(request.envelopesDeleted ?? 0)} envelopes, {formatNumber(request.filesDeleted ?? 0)} files deleted
                  </p>
                ) : null}
                {request.error ? <p className="max-w-sm truncate text-xs text-red-700 dark:text-red-300" title={request.error}>{request.error}</p> : null}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell" title={formatDateTime(request.createdAt)}>
                by {request.requestedByEmail}
              </TableCell>
              <TableCell>
                <StatusBadge request={request} />
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell" title={formatDateTime(request.scheduledFor)}>
                {whenText(request)}
              </TableCell>
              <TableCell className="pe-5 text-end">
                <Actions show={canManage && isOpen(request)} onKeep={() => onSpec(cancelWorkspaceSpec(request))} onRun={() => onSpec(runWorkspaceSpec(request) as ActionSpec<never>)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination page={deletions.data.page} pageSize={deletions.data.pageSize} total={deletions.data.total} onPage={onPage} />
    </>
  );
}

function AccountDeletions({ status, page, onPage, onSpec }: { status: string; page: number; onPage: (page: number) => void; onSpec: (spec: ActionSpec<never>) => void }) {
  const deletions = useAccountDeletions({ status, page });
  const canManage = useCan("super_admin");
  if (deletions.isPending) return <Loading />;
  if (deletions.error) return <ErrorState error={deletions.error} onRetry={() => void deletions.refetch()} />;
  if (deletions.data.items.length === 0) {
    return <Empty text={status === "open" ? "No accounts scheduled for deletion" : "Nothing here"} hint="People request deletion of their own account in Settings → Profile." />;
  }
  return (
    <>
      <Table>
        <Header first="Account" />
        <TableBody>
          {deletions.data.items.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="ps-5">
                <Link to={`/users/${request.userId}`} className="font-medium hover:text-primary hover:underline">
                  {request.userEmail}
                </Link>
                {request.status === "completed" ? (
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(request.workspacesDeleted ?? 0)} {request.workspacesDeleted === 1 ? "workspace" : "workspaces"} deleted
                  </p>
                ) : null}
                {request.error ? <p className="max-w-sm truncate text-xs text-red-700 dark:text-red-300" title={request.error}>{request.error}</p> : null}
                {request.warning ? <p className="max-w-sm truncate text-xs text-amber-700 dark:text-amber-300" title={request.warning}>{request.warning}</p> : null}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell" title={formatDateTime(request.createdAt)}>
                {formatRelative(request.createdAt)}
              </TableCell>
              <TableCell>
                <StatusBadge request={request} />
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell" title={formatDateTime(request.scheduledFor)}>
                {whenText(request)}
              </TableCell>
              <TableCell className="pe-5 text-end">
                <Actions show={canManage && isOpen(request)} onKeep={() => onSpec(cancelAccountSpec(request))} onRun={() => onSpec(runAccountSpec(request) as ActionSpec<never>)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination page={deletions.data.page} pageSize={deletions.data.pageSize} total={deletions.data.total} onPage={onPage} />
    </>
  );
}

export function DeletionsPage() {
  const params = useListParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const kind = searchParams.get("kind") ?? "";
  const status = params.status === "" ? "open" : params.status === "all" ? "" : params.status;
  const [spec, setSpec] = useState<ActionSpec<never> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const setKind = (value: string) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set("kind", value);
      else next.delete("kind");
      next.delete("page");
      return next;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deletions"
        description="Workspaces and accounts people asked to delete. Each is deleted 30 days after the request unless they or an admin cancel it."
      />
      <Notice message={notice} onDismiss={() => setNotice(null)} />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <StatusFilter value={kind} onChange={setKind} options={kindOptions} label="What was deleted" />
          <StatusFilter value={params.status} onChange={params.setStatus} options={filterOptions} />
        </div>
        {kind === "accounts" ? (
          <AccountDeletions status={status} page={params.page} onPage={params.setPage} onSpec={setSpec} />
        ) : (
          <WorkspaceDeletions status={status} page={params.page} onPage={params.setPage} onSpec={setSpec} />
        )}
      </Card>

      <ActionDialog spec={spec} onClose={() => setSpec(null)} onDone={setNotice} />
    </div>
  );
}
