import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@signet/ui/components/table";

import { InitialAvatar } from "@/components/initial-avatar";
import { Badge, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination, RoleBadge, SearchField, SuspensionBadge } from "@/components/page";
import { StatusFilter } from "@/components/status-filter";
import { useUsers } from "@/lib/api";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { useListParams } from "@/lib/use-list-params";

export function UsersPage() {
  const navigate = useNavigate();
  const params = useListParams();
  const users = useUsers({ query: params.query, status: params.status, page: params.page });
  const total = users.data?.total;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description={
          total === undefined
            ? "Everyone who has used Signet."
            : `${formatNumber(total)} ${total === 1 ? "user" : "users"}${params.query || params.status ? " match" : ""} · people appear after their first sign-in`
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchField value={params.draft} onChange={params.setDraft} placeholder="Search email, name or ID" />
          <StatusFilter value={params.status} onChange={params.setStatus} />
        </div>

        {users.isPending ? (
          <Loading />
        ) : users.error ? (
          <ErrorState error={users.error} onRetry={() => void users.refetch()} />
        ) : users.data.items.length === 0 ? (
          <EmptyState title="No users found" description={params.query ? "Try a different search or filter." : undefined} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="ps-5">User</TableHead>
                  <TableHead className="text-end">Workspaces</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10 pe-5" aria-label="Open" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.items.map((user) => {
                  const open = () => navigate(`/users/${user.id}`);
                  return (
                    <TableRow key={user.id} className="group cursor-pointer" tabIndex={0} onClick={open} onKeyDown={(event) => event.key === "Enter" && open()}>
                      <TableCell className="ps-5">
                        <div className="flex items-center gap-3">
                          <InitialAvatar name={user.name} seed={user.id} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 font-medium">
                              <span className="truncate">{user.name}</span>
                              {user.adminRole ? <RoleBadge role={user.adminRole} /> : null}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{formatNumber(user.workspaceCount)}</TableCell>
                      <TableCell className="text-muted-foreground" title={formatDate(user.createdAt)}>
                        {formatRelative(user.createdAt)}
                      </TableCell>
                      <TableCell>
                        {user.deletedAt ? <Badge>Deleted</Badge> : <SuspensionBadge suspendedAt={user.suspendedAt} />}
                      </TableCell>
                      <TableCell className="pe-5 text-muted-foreground">
                        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination page={users.data.page} pageSize={users.data.pageSize} total={users.data.total} onPage={params.setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
