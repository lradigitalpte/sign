import { History, MoreHorizontal, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "@signet/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@signet/ui/components/dropdown-menu";
import { Input } from "@signet/ui/components/input";
import { Label } from "@signet/ui/components/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@signet/ui/components/table";
import { cn } from "@signet/ui/lib/utils";

import { ActionDialog, Notice, type ActionSpec } from "@/components/action-dialog";
import { useAdmin, useCan } from "@/lib/admin-context";
import { InitialAvatar } from "@/components/initial-avatar";
import { Badge, Card, EmptyState, ErrorState, Loading, PageHeader, RoleBadge } from "@/components/page";
import { useAdmins } from "@/lib/api";
import { formatDate, formatRelative, roleLabels } from "@/lib/format";
import type { Admin, AdminRole } from "@/lib/types";

const roles: { role: AdminRole; text: string }[] = [
  { role: "read_only", text: "View everything; change nothing." },
  { role: "support", text: "Also resend emails and invitations, retry the email queue and extend envelopes." },
  { role: "super_admin", text: "Everything, including suspensions, voiding, member changes and managing admins." },
];

function RolePicker({ value, onChange }: { value: AdminRole | null; onChange: (role: AdminRole) => void }) {
  return (
    <div role="radiogroup" aria-label="Role" className="grid gap-2">
      {roles.map(({ role, text }) => (
        <button
          key={role}
          type="button"
          role="radio"
          aria-checked={value === role}
          onClick={() => onChange(role)}
          className={cn(
            "rounded-xl border p-3 text-start transition-colors",
            value === role ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/60",
          )}
        >
          <span className="text-sm font-medium">{roleLabels[role]}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{text}</span>
        </button>
      ))}
    </div>
  );
}

function grantSpec(email: string, role: AdminRole | null, setEmail: (value: string) => void, setRole: (role: AdminRole) => void): ActionSpec<Admin> {
  return {
    title: "Add an admin",
    description: "They must have signed in to Signet at least once. They'll see this app the next time they open it.",
    confirmLabel: "Give access",
    reasonPlaceholder: "e.g. Joined the support team",
    ready: email.includes("@") && role !== null,
    fields: (
      <>
        <div className="grid gap-2">
          <Label htmlFor="admin-email">Email</Label>
          <Input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" autoComplete="off" required />
        </div>
        <div className="grid gap-2">
          <Label>Role</Label>
          <RolePicker value={role} onChange={setRole} />
        </div>
      </>
    ),
    request: (reason) => ({ method: "POST", path: "/admins", body: { email, role, reason } }),
    success: (admin) => `${admin.name} is now ${roleLabels[admin.role].toLowerCase()}.`,
  };
}

function changeRoleSpec(admin: Admin, role: AdminRole): ActionSpec<Admin> {
  return {
    title: `Make ${admin.name} ${roleLabels[role].toLowerCase()}?`,
    description: `${roles.find((r) => r.role === role)?.text} They're currently ${roleLabels[admin.role].toLowerCase()}.`,
    confirmLabel: "Change role",
    reasonPlaceholder: "e.g. Moved to the support team",
    request: (reason) => ({ method: "POST", path: "/admins", body: { email: admin.email, role, reason } }),
    success: () => `${admin.name} is now ${roleLabels[role].toLowerCase()}.`,
  };
}

function revokeSpec(admin: Admin): ActionSpec {
  return {
    title: `Remove ${admin.name}'s admin access?`,
    description: "They lose access to this app straight away. Their Signet account and workspaces aren't affected.",
    confirmLabel: "Remove access",
    destructive: true,
    reasonPlaceholder: "e.g. Left the company",
    request: (reason) => ({ method: "DELETE", path: `/admins/${encodeURIComponent(admin.userId)}`, body: { reason } }),
    success: () => `${admin.name} no longer has admin access.`,
  };
}

export function AdminsPage() {
  const admins = useAdmins();
  const me = useAdmin();
  const canManage = useCan("super_admin");
  const [spec, setSpec] = useState<ActionSpec<never> | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The add form's inputs live here, so its spec is rebuilt as they change.
  const active = adding ? (grantSpec(email, role, setEmail, setRole) as ActionSpec<never>) : spec;
  const close = () => {
    setSpec(null);
    setAdding(false);
    setEmail("");
    setRole(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admins"
        description="Signet staff with access to this app."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <UserPlus /> Add admin
            </Button>
          ) : null
        }
      />
      <Notice message={notice} onDismiss={() => setNotice(null)} />

      <div className="grid gap-3 sm:grid-cols-3">
        {roles.map(({ role: r, text }) => (
          <Card key={r} className="p-4">
            <RoleBadge role={r} />
            <p className="mt-2 text-sm text-muted-foreground">{text}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        {admins.isPending ? (
          <Loading />
        ) : admins.error ? (
          <ErrorState error={admins.error} onRetry={() => void admins.refetch()} />
        ) : admins.data.length === 0 ? (
          <EmptyState title="No admins" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="ps-5">Admin</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden sm:table-cell">Since</TableHead>
                <TableHead className="w-12 pe-4" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.data.map((admin) => {
                const self = admin.userId === me.userId;
                return (
                  <TableRow key={admin.userId}>
                    <TableCell className="ps-5">
                      <div className="flex items-center gap-3">
                        <InitialAvatar name={admin.name} seed={admin.userId} size="sm" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-2">
                            <Link to={`/users/${admin.userId}`} className="truncate font-medium hover:text-primary hover:underline">
                              {admin.name}
                            </Link>
                            {self ? <Badge>You</Badge> : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={admin.role} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell" title={formatDate(admin.createdAt)}>
                      {formatRelative(admin.createdAt)}
                    </TableCell>
                    <TableCell className="pe-4 text-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Options for ${admin.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem asChild>
                            <Link to={`/audit?adminId=${admin.userId}`}>
                              <History /> View their actions
                            </Link>
                          </DropdownMenuItem>
                          {canManage && !self ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>Change role</DropdownMenuLabel>
                              {roles
                                .filter((r) => r.role !== admin.role)
                                .map((r) => (
                                  <DropdownMenuItem key={r.role} onSelect={() => setSpec(changeRoleSpec(admin, r.role) as ActionSpec<never>)}>
                                    <ShieldCheck /> Make {roleLabels[r.role].toLowerCase()}
                                  </DropdownMenuItem>
                                ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => setSpec(revokeSpec(admin))}>
                                <UserMinus /> Remove admin access
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="text-sm text-muted-foreground">
        You can&apos;t change your own access. The first super admin is granted from the command line:{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">go run ./cmd/admin grant --email … --role super_admin</code>
      </p>

      <ActionDialog spec={active} onClose={close} onDone={setNotice} />
    </div>
  );
}
