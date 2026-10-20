import { ChevronRight } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@signet/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@signet/ui/components/table";

import { InitialAvatar, isPersonalWorkspace } from "@/components/initial-avatar";
import { Badge, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination, PlanBadge, SearchField, SuspensionBadge } from "@/components/page";
import { StatusFilter } from "@/components/status-filter";
import { useWorkspaces } from "@/lib/api";
import { formatDate, formatNumber, formatRelative, planLabels } from "@/lib/format";
import { useListParams } from "@/lib/use-list-params";

export function WorkspacesPage() {
  const navigate = useNavigate();
  const params = useListParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const plan = searchParams.get("plan") ?? "";
  const setPlan = (value: string) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set("plan", value);
      else next.delete("plan");
      next.delete("page");
      return next;
    });
  const workspaces = useWorkspaces({ query: params.query, status: params.status, plan, page: params.page });
  const total = workspaces.data?.total;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workspaces"
        description={total === undefined ? "Every customer workspace on Signet." : `${formatNumber(total)} ${total === 1 ? "workspace" : "workspaces"}${params.query || params.status || plan ? " match" : " on Signet"}`}
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchField value={params.draft} onChange={params.setDraft} placeholder="Search name, slug, ID or member email" />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={plan || "all"} onValueChange={(value) => setPlan(value === "all" ? "" : value)}>
              <SelectTrigger className="h-9 w-36" aria-label="Plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                {Object.entries(planLabels).map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <StatusFilter value={params.status} onChange={params.setStatus} />
          </div>
        </div>

        {workspaces.isPending ? (
          <Loading />
        ) : workspaces.error ? (
          <ErrorState error={workspaces.error} onRetry={() => void workspaces.refetch()} />
        ) : workspaces.data.items.length === 0 ? (
          <EmptyState title="No workspaces found" description={params.query ? "Try a different search or filter." : undefined} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="ps-5">Workspace</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-end">Members</TableHead>
                  <TableHead className="text-end">Envelopes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10 pe-5" aria-label="Open" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspaces.data.items.map((workspace) => {
                  const open = () => navigate(`/workspaces/${workspace.id}`);
                  const personal = isPersonalWorkspace(workspace.slug);
                  return (
                    <TableRow key={workspace.id} className="group cursor-pointer" tabIndex={0} onClick={open} onKeyDown={(event) => event.key === "Enter" && open()}>
                      <TableCell className="ps-5">
                        <div className="flex items-center gap-3">
                          <InitialAvatar name={workspace.name} seed={workspace.id} shape="square" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 font-medium">
                              <span className="truncate">{workspace.name}</span>
                              {workspace.plan !== "free" ? <PlanBadge plan={workspace.plan} /> : null}
                              {personal ? <Badge>Personal</Badge> : null}
                            </p>
                            {personal ? null : <p className="truncate text-xs text-muted-foreground">{workspace.slug}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{workspace.ownerEmail ?? "—"}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatNumber(workspace.memberCount)}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatNumber(workspace.envelopeCount)}</TableCell>
                      <TableCell className="text-muted-foreground" title={formatDate(workspace.createdAt)}>
                        {formatRelative(workspace.createdAt)}
                      </TableCell>
                      <TableCell>
                        <SuspensionBadge suspendedAt={workspace.suspendedAt} />
                      </TableCell>
                      <TableCell className="pe-5 text-muted-foreground">
                        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination page={workspaces.data.page} pageSize={workspaces.data.pageSize} total={workspaces.data.total} onPage={params.setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
