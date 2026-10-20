import { ArrowLeft, BadgeCheck, Ban, CalendarDays, History, KeyRound, Mail, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";

import { Button } from "@signet/ui/components/button";
import { Table, TableBody, TableCell, TableRow } from "@signet/ui/components/table";

import { ActionDialog, Notice, type ActionSpec } from "@/components/action-dialog";
import { useAdmin, useCan } from "@/lib/admin-context";
import { CopyButton } from "@/components/copy-button";
import { InitialAvatar } from "@/components/initial-avatar";
import { Badge, Card, CardHeader, EmptyState, ErrorState, Loading, PageHeader, RoleBadge, SuspensionBadge } from "@/components/page";
import { ApiError, useUser } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import type { UserDetail } from "@/lib/types";

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}

const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`;

function suspendSpec(u: UserDetail): ActionSpec {
  return {
    title: `Suspend ${u.name}?`,
    description: `They can't use Signet at all until restored: no signing in to the app, sending or managing envelopes, in any of their ${plural(u.memberships.length, "workspace", "workspaces")}. Other members of those workspaces aren't affected.`,
    confirmLabel: "Suspend account",
    destructive: true,
    reasonPlaceholder: "e.g. Sending phishing documents, reported by recipients",
    request: (reason) => ({ method: "POST", path: `/users/${encodeURIComponent(u.id)}/suspend`, body: { reason } }),
    success: () => `${u.name} is suspended.`,
  };
}

function restoreSpec(u: UserDetail): ActionSpec {
  return {
    title: `Restore ${u.name}?`,
    description: "They can use Signet again straight away.",
    confirmLabel: "Restore account",
    reasonPlaceholder: "e.g. Appeal accepted",
    request: (reason) => ({ method: "POST", path: `/users/${encodeURIComponent(u.id)}/unsuspend`, body: { reason } }),
    success: () => `${u.name} is active again.`,
  };
}

export function UserDetailPage() {
  const { id = "" } = useParams();
  const user = useUser(id);
  const me = useAdmin();
  const canManage = useCan("super_admin");
  const [spec, setSpec] = useState<ActionSpec | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const back = (
    <Link to="/users" className="inline-flex items-center gap-1.5 hover:text-foreground">
      <ArrowLeft className="size-4" /> Users
    </Link>
  );

  if (user.isPending) return <Loading />;
  if (user.error) {
    const missing = user.error instanceof ApiError && user.error.status === 404;
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={back} title={missing ? "User not found" : "User"} />
        <Card>{missing ? <EmptyState title="No user with this ID" /> : <ErrorState error={user.error} onRetry={() => void user.refetch()} />}</Card>
      </div>
    );
  }

  const u = user.data;
  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">{back}</div>
      <Notice message={notice} onDismiss={() => setNotice(null)} />

      <Card className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <InitialAvatar name={u.name} seed={u.id} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{u.name}</h1>
            {u.deletedAt ? <Badge>Deleted account</Badge> : <SuspensionBadge suspendedAt={u.suspendedAt} />}
            {u.adminRole ? <RoleBadge role={u.adminRole} /> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <Meta icon={<Mail className="size-4" />}>{u.email}</Meta>
            <Meta icon={<CalendarDays className="size-4" />}>
              <span title={formatDate(u.createdAt)}>Joined {formatRelative(u.createdAt)}</span>
            </Meta>
            <Meta icon={<BadgeCheck className="size-4" />}>{u.emailVerifiedAt ? "Email verified" : "Email not verified"}</Meta>
            <Meta icon={<Send className="size-4" />}>{plural(u.envelopesSent, "envelope sent", "envelopes sent")}</Meta>
            <Meta icon={<span className="font-mono text-xs">ID</span>}>
              <span className="font-mono text-xs">{u.id.slice(0, 8)}…</span>
              <CopyButton value={u.id} label="Copy user ID" />
            </Meta>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/audit?targetId=${u.id}`}>
              <History /> History
            </Link>
          </Button>
          {canManage && u.id !== me.userId && !u.deletedAt ? (
            u.suspendedAt ? (
              <Button variant="outline" size="sm" onClick={() => setSpec(restoreSpec(u))}>
                <RotateCcw /> Restore
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                disabled={Boolean(u.adminRole)}
                title={u.adminRole ? "Remove their admin access first" : undefined}
                onClick={() => setSpec(suspendSpec(u))}
              >
                <Ban /> Suspend
              </Button>
            )
          ) : null}
        </div>
      </Card>

      {u.deletedAt ? (
        <div role="status" className="rounded-2xl border bg-muted/40 p-4 text-sm">
          <p className="font-medium">This person deleted their account {formatRelative(u.deletedAt)}.</p>
          <p className="mt-1 text-muted-foreground">Their details were removed. The record stays because envelopes they sent in other workspaces still refer to it.</p>
        </div>
      ) : null}
      {u.accountDeletion ? (
        <div role="status" className="flex flex-col gap-2 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm sm:flex-row sm:items-center">
          <p className="flex-1">
            <span className="font-medium text-red-700 dark:text-red-300">
              {u.accountDeletion.status === "failed" ? "Account deletion failed and will be retried." : `Account scheduled for deletion on ${formatDate(u.accountDeletion.scheduledFor)}.`}
            </span>{" "}
            <span className="text-muted-foreground">{u.accountDeletion.error ?? "They asked for it themselves."}</span>
          </p>
          <Link to="/deletions?kind=accounts" className="text-sm font-medium text-primary hover:underline">
            Deletion queue
          </Link>
        </div>
      ) : null}
      {u.suspendedAt ? (
        <div role="status" className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm">
          <p className="font-medium text-red-700 dark:text-red-300">Suspended {formatDateTime(u.suspendedAt)}</p>
          {u.suspendedReason ? <p className="mt-1 text-muted-foreground">Reason: {u.suspendedReason}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="self-start overflow-hidden">
          <CardHeader title="Workspaces" description={`Member of ${plural(u.memberships.length, "workspace", "workspaces")}`} />
          {u.memberships.length === 0 ? (
            <EmptyState title="Not in any workspace" />
          ) : (
            <Table>
              <TableBody>
                {u.memberships.map((membership) => (
                  <TableRow key={membership.workspaceId}>
                    <TableCell className="ps-5">
                      <Link to={`/workspaces/${membership.workspaceId}`} className="group flex items-center gap-3">
                        <InitialAvatar name={membership.workspaceName} seed={membership.workspaceId} shape="square" size="sm" />
                        <span className="truncate font-medium group-hover:text-primary group-hover:underline">{membership.workspaceName}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={membership.role} />
                    </TableCell>
                    <TableCell className="pe-5 text-end text-muted-foreground" title={formatDate(membership.joinedAt)}>
                      Joined {formatRelative(membership.joinedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <KeyRound className="size-4 text-muted-foreground" /> Sign-in methods
            </h2>
            {u.identities.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None recorded.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {u.identities.map((identity) => (
                  <li key={identity.provider + identity.createdAt} className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{identity.provider === "workos" ? "WorkOS" : identity.provider}</span>
                      <span className="block truncate text-xs text-muted-foreground">{identity.email ?? "—"}</span>
                    </span>
                    <span className="text-xs text-muted-foreground" title={formatDate(identity.createdAt)}>
                      since {formatRelative(identity.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4 text-muted-foreground" /> Platform access
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {u.adminRole ? (
                <>
                  Has admin access as <RoleBadge role={u.adminRole} />
                </>
              ) : (
                "Customer account. No access to this admin app."
              )}
            </p>
          </Card>
        </div>
      </div>

      <ActionDialog spec={spec} onClose={() => setSpec(null)} onDone={setNotice} />
    </div>
  );
}
