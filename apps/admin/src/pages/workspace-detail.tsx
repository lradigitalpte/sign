import { ArrowLeft, Ban, CalendarDays, FileText, History, Pencil, HardDrive, Mail, MoreHorizontal, RotateCcw, Send, Settings2, ShieldCheck, UserMinus, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";

import { Button } from "@signet/ui/components/button";
import { Input } from "@signet/ui/components/input";
import { Label } from "@signet/ui/components/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@signet/ui/components/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@signet/ui/components/table";

import { ActionDialog, Notice, type ActionSpec } from "@/components/action-dialog";
import { useCan } from "@/lib/admin-context";
import { CopyButton } from "@/components/copy-button";
import { InitialAvatar, isPersonalWorkspace } from "@/components/initial-avatar";
import { Badge, Card, CardHeader, EmptyState, ErrorState, Loading, PageHeader, PlanBadge, RoleBadge, SuspensionBadge } from "@/components/page";
import { PlanCard } from "@/components/plan-card";
import { DeletionBanner, PrivacyCard } from "@/components/privacy-card";
import { StatusBreakdown } from "@/components/status-breakdown";
import { UsageCard, WorkspaceFlagsCard } from "@/components/usage-card";
import { ApiError, useWorkspace } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber, formatRelative, roleLabels } from "@/lib/format";
import type { WorkspaceDetail } from "@/lib/types";

const storageLabels: Record<string, string> = { platform: "Signet storage", s3: "AWS S3", r2: "Cloudflare R2", s3_compatible: "S3-compatible" };

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}

const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`;

type Member = WorkspaceDetail["members"][number];
type Invitation = WorkspaceDetail["invitations"][number];

const workspacePath = (w: WorkspaceDetail) => `/workspaces/${encodeURIComponent(w.id)}`;

function suspendSpec(w: WorkspaceDetail): ActionSpec {
  return {
    title: `Suspend ${w.name}?`,
    description: `All ${plural(w.memberCount, "member", "members")} lose access straight away: they can't open, send or manage anything in this workspace. Envelopes already sent stay as they are. You can restore it at any time.`,
    confirmLabel: "Suspend workspace",
    destructive: true,
    reasonPlaceholder: "e.g. Chargeback and suspected fraud, ticket #1234",
    request: (reason) => ({ method: "POST", path: `${workspacePath(w)}/suspend`, body: { reason } }),
    success: () => `${w.name} is suspended.`,
  };
}

function renameSpec(w: WorkspaceDetail, name: string, setName: (value: string) => void): ActionSpec<{ name: string; syncedToWorkOS: boolean }> {
  return {
    title: `Rename ${w.name}`,
    description: isPersonalWorkspace(w.slug)
      ? "Personal workspaces are normally named after their owner. After this, the name stays as you set it."
      : "The name is changed in WorkOS too, so it doesn't revert on the next sign-in.",
    confirmLabel: "Rename",
    reasonPlaceholder: "e.g. Owner asked; they can't change it themselves",
    ready: name.trim().length > 0 && name.trim() !== w.name,
    fields: (
      <div className="grid gap-2">
        <Label htmlFor="workspace-name">New name</Label>
        <Input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoFocus />
      </div>
    ),
    request: (reason) => ({ method: "PATCH", path: workspacePath(w), body: { name: name.trim(), reason } }),
    success: (result) => `Renamed to ${result.name}${result.syncedToWorkOS ? " (in WorkOS too)" : ""}.`,
  };
}

function restoreSpec(w: WorkspaceDetail): ActionSpec {
  return {
    title: `Restore ${w.name}?`,
    description: "Members get access back immediately.",
    confirmLabel: "Restore workspace",
    reasonPlaceholder: "e.g. Resolved with the customer",
    request: (reason) => ({ method: "POST", path: `${workspacePath(w)}/unsuspend`, body: { reason } }),
    success: () => `${w.name} is active again.`,
  };
}

function roleSpec(w: WorkspaceDetail, member: Member, role: string): ActionSpec {
  const label = roleLabels[role].toLowerCase();
  return {
    title: `Make ${member.name} ${role === "admin" ? "an" : "a"} ${label}?`,
    description: `They're currently ${roleLabels[member.role].toLowerCase()} in ${w.name}. The change applies on their next request.`,
    confirmLabel: "Change role",
    reasonPlaceholder: "e.g. Owner asked us by email because they can't sign in",
    request: (reason) => ({ method: "PATCH", path: `${workspacePath(w)}/members/${encodeURIComponent(member.userId)}`, body: { role, reason } }),
    success: () => `${member.name} is now ${role === "admin" ? "an" : "a"} ${label}.`,
  };
}

function removeSpec(w: WorkspaceDetail, member: Member): ActionSpec {
  return {
    title: `Remove ${member.name} from ${w.name}?`,
    description: "They lose access to this workspace and its envelopes. Their account and other workspaces aren't affected, and they can be invited again.",
    confirmLabel: "Remove member",
    destructive: true,
    reasonPlaceholder: "e.g. Owner asked us to remove a former employee",
    request: (reason) => ({ method: "DELETE", path: `${workspacePath(w)}/members/${encodeURIComponent(member.userId)}`, body: { reason } }),
    success: () => `${member.name} was removed from ${w.name}.`,
  };
}

function resendSpec(w: WorkspaceDetail, invitation: Invitation): ActionSpec<{ emailSent: boolean }> {
  return {
    title: "Resend invitation",
    description: `${invitation.email} gets a new link that works for 7 days. The old link stops working.`,
    confirmLabel: "Resend",
    reasonRequired: false,
    reasonPlaceholder: "e.g. They couldn't find the first email",
    request: (reason) => ({ method: "POST", path: `${workspacePath(w)}/invitations/${encodeURIComponent(invitation.id)}/resend`, body: { reason } }),
    success: (result) =>
      result.emailSent ? `Sent a new invitation to ${invitation.email}.` : `Made a new link for ${invitation.email}, but the email couldn't be sent. Check the mail settings.`,
  };
}

const assignableRoles = ["admin", "member", "viewer"];

function isExpired(invitation: Invitation) {
  return invitation.status === "pending" && new Date(invitation.expiresAt).getTime() < Date.now();
}

export function WorkspaceDetailPage() {
  const { id = "" } = useParams();
  const workspace = useWorkspace(id);
  const canManage = useCan("super_admin");
  const canSupport = useCan("support");
  const [spec, setSpec] = useState<ActionSpec<never> | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const open = (next: ActionSpec<never>) => setSpec(next);

  const back = (
    <Link to="/workspaces" className="inline-flex items-center gap-1.5 hover:text-foreground">
      <ArrowLeft className="size-4" /> Workspaces
    </Link>
  );

  if (workspace.isPending) return <Loading />;
  if (workspace.error) {
    const missing = workspace.error instanceof ApiError && workspace.error.status === 404;
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={back} title={missing ? "Workspace not found" : "Workspace"} />
        <Card>{missing ? <EmptyState title="No workspace with this ID" /> : <ErrorState error={workspace.error} onRetry={() => void workspace.refetch()} />}</Card>
      </div>
    );
  }

  const w = workspace.data;
  const personal = isPersonalWorkspace(w.slug);
  const envelopeTotal = Object.values(w.envelopesByStatus).reduce((sum, count) => sum + count, 0);
  const pendingInvites = w.invitations.filter((invitation) => invitation.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">{back}</div>
      <Notice message={notice} onDismiss={() => setNotice(null)} />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <InitialAvatar name={w.name} seed={w.id} shape="square" size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{w.name}</h1>
              <SuspensionBadge suspendedAt={w.suspendedAt} />
              <PlanBadge plan={w.plan} />
              {personal ? <Badge>Personal workspace</Badge> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <Meta icon={<UserRound className="size-4" />}>{w.ownerEmail ?? "No owner"}</Meta>
              <Meta icon={<CalendarDays className="size-4" />}>
                <span title={formatDate(w.createdAt)}>Created {formatRelative(w.createdAt)}</span>
              </Meta>
              <Meta icon={<HardDrive className="size-4" />}>{storageLabels[w.storageProvider] ?? w.storageProvider}</Meta>
              <Meta icon={<span className="font-mono text-xs">ID</span>}>
                <span className="font-mono text-xs">{w.id.slice(0, 8)}…</span>
                <CopyButton value={w.id} label="Copy workspace ID" />
              </Meta>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to={`/audit?targetId=${w.id}`}>
                <History /> History
              </Link>
            </Button>
            {envelopeTotal > 0 ? (
              <Button asChild variant="outline" size="sm">
                <Link to={`/envelopes?workspace=${w.id}`}>
                  <FileText /> View envelopes
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              <Button variant="outline" size="sm" onClick={() => setRenaming(w.name)}>
                <Pencil /> Rename
              </Button>
            ) : null}
            {canManage ? (
              w.suspendedAt ? (
                <Button variant="outline" size="sm" onClick={() => open(restoreSpec(w))}>
                  <RotateCcw /> Restore
                </Button>
              ) : (
                <Button variant="destructive" size="sm" onClick={() => open(suspendSpec(w))}>
                  <Ban /> Suspend
                </Button>
              )
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x border-t sm:grid-cols-4">
          <Figure label="Members" value={w.memberCount} />
          <Figure label="Envelopes" value={envelopeTotal} />
          <Figure label="Completed" value={w.envelopesByStatus.completed ?? 0} />
          <Figure label="In progress" value={w.envelopesByStatus.in_progress ?? 0} />
        </div>
      </Card>

      <DeletionBanner privacy={w.privacy} />

      {w.suspendedAt ? (
        <div role="status" className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm">
          <p className="font-medium text-red-700 dark:text-red-300">Suspended {formatDateTime(w.suspendedAt)}</p>
          {w.suspendedReason ? <p className="mt-1 text-muted-foreground">Reason: {w.suspendedReason}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <UsageCard workspaceId={w.id} />

          <Card className="overflow-hidden">
            <CardHeader title="Members" description={plural(w.members.length, "person", "people")} />
            {w.members.length === 0 ? (
              <EmptyState title="No members" />
            ) : (
              <Table>
                <TableBody>
                  {w.members.map((member) => (
                    <TableRow key={member.userId}>
                      <TableCell className="ps-5">
                        <Link to={`/users/${member.userId}`} className="group flex items-center gap-3">
                          <InitialAvatar name={member.name} seed={member.userId} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium group-hover:text-primary group-hover:underline">{member.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={member.role} />
                      </TableCell>
                      <TableCell className="hidden text-end text-muted-foreground sm:table-cell" title={formatDate(member.joinedAt)}>
                        Joined {formatRelative(member.joinedAt)}
                      </TableCell>
                      <TableCell className="w-12 pe-4 text-end">
                        {canManage && member.role !== "owner" ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Manage ${member.name}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel>Change role</DropdownMenuLabel>
                              {assignableRoles
                                .filter((role) => role !== member.role)
                                .map((role) => (
                                  <DropdownMenuItem key={role} onSelect={() => open(roleSpec(w, member, role))}>
                                    <ShieldCheck /> Make {roleLabels[role].toLowerCase()}
                                  </DropdownMenuItem>
                                ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => open(removeSpec(w, member))}>
                                <UserMinus /> Remove from workspace
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Invitations" description={pendingInvites ? `${plural(pendingInvites, "pending invitation", "pending invitations")} · most recent 50` : "Most recent 50"} />
            {w.invitations.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-6 text-sm text-muted-foreground">
                <Mail className="size-4" /> No one has been invited to this workspace.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="ps-5">Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Expires</TableHead>
                    <TableHead className="w-24 pe-5" aria-label="Actions" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {w.invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell className="ps-5 font-medium">{invitation.email}</TableCell>
                      <TableCell>
                        <RoleBadge role={invitation.role} />
                      </TableCell>
                      <TableCell>
                        {isExpired(invitation) ? (
                          <Badge>Expired</Badge>
                        ) : (
                          <Badge tone={invitation.status === "pending" ? "warning" : invitation.status === "accepted" ? "success" : "neutral"} className="capitalize">
                            {invitation.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDate(invitation.expiresAt)}</TableCell>
                      <TableCell className="pe-5 text-end">
                        {canSupport && invitation.status === "pending" ? (
                          <Button variant="outline" size="sm" onClick={() => open(resendSpec(w, invitation) as ActionSpec<never>)}>
                            <Send /> Resend
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <PlanCard workspace={w} onDone={setNotice} />
          <StatusBreakdown counts={w.envelopesByStatus} />
          <PrivacyCard privacy={w.privacy} />
          <WorkspaceFlagsCard workspaceId={w.id} />

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Settings2 className="size-4 text-muted-foreground" /> Configured settings
            </h2>
            {w.settingsSections.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Using the defaults everywhere.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {w.settingsSections.map((section) => (
                  <Badge key={section} className="capitalize">
                    {section.replace(/-/g, " ")}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <ActionDialog
        spec={renaming !== null ? (renameSpec(w, renaming, setRenaming) as ActionSpec<never>) : spec}
        onClose={() => {
          setSpec(null);
          setRenaming(null);
        }}
        onDone={setNotice}
      />
    </div>
  );
}
