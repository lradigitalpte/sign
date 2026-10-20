import { ChevronRight, FileText, X } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@signet/ui/components/table";

import { Card, EmptyState, EnvelopeStatusBadge, ErrorState, Loading, PageHeader, Pagination, SearchField } from "@/components/page";
import { StatusFilter } from "@/components/status-filter";
import { useEnvelopes, useWorkspace } from "@/lib/api";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { useListParams } from "@/lib/use-list-params";

const statusOptions = [
  { value: "", label: "All" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "expired", label: "Expired" },
  { value: "voided", label: "Voided" },
  { value: "draft", label: "Draft" },
];

/** "2 of 3 signed" with a thin bar; viewers and CCs aren't counted. */
export function SigningProgress({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="text-muted-foreground">No signers</span>;
  const percent = Math.round((done / total) * 100);
  return (
    <div className="min-w-28">
      <p className="text-sm tabular-nums">
        {formatNumber(done)} of {formatNumber(total)} signed
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function WorkspaceChip({ id }: { id: string }) {
  const [, setSearchParams] = useSearchParams();
  const workspace = useWorkspace(id);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-0.5 ps-3 pe-1 text-sm">
      Workspace:{" "}
      <Link to={`/workspaces/${id}`} className="font-medium hover:underline">
        {workspace.data?.name ?? "…"}
      </Link>
      <button
        type="button"
        aria-label="Show envelopes from every workspace"
        className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() =>
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.delete("workspace");
            next.delete("page");
            return next;
          })
        }
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

export function EnvelopesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get("workspace") ?? "";
  const params = useListParams();
  const envelopes = useEnvelopes({ query: params.query, status: params.status, page: params.page, workspaceId });
  const total = envelopes.data?.total;
  const filtered = Boolean(params.query || params.status || workspaceId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Envelopes"
        description={
          total === undefined
            ? "Every envelope sent on Signet, across all workspaces."
            : `${formatNumber(total)} ${total === 1 ? "envelope" : "envelopes"}${filtered ? " match" : " across all workspaces"} · document contents stay private`
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchField value={params.draft} onChange={params.setDraft} placeholder="Search ID, title or recipient email" />
            {workspaceId ? <WorkspaceChip id={workspaceId} /> : null}
          </div>
          <StatusFilter value={params.status} onChange={params.setStatus} options={statusOptions} />
        </div>

        {envelopes.isPending ? (
          <Loading />
        ) : envelopes.error ? (
          <ErrorState error={envelopes.error} onRetry={() => void envelopes.refetch()} />
        ) : envelopes.data.items.length === 0 ? (
          <EmptyState title="No envelopes found" description={filtered ? "Try a different search or filter. Paste a full envelope ID to find templates too." : undefined} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="ps-5">Envelope</TableHead>
                  <TableHead className="hidden md:table-cell">Progress</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Updated</TableHead>
                  <TableHead className="w-10 pe-5" aria-label="Open" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {envelopes.data.items.map((envelope) => {
                  const open = () => navigate(`/envelopes/${envelope.id}`);
                  return (
                    <TableRow key={envelope.id} className="group cursor-pointer" tabIndex={0} onClick={open} onKeyDown={(event) => event.key === "Enter" && open()}>
                      <TableCell className="ps-5">
                        <div className="flex items-center gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                            <FileText className="size-4.5" />
                          </span>
                          <div className="min-w-0 max-w-[14rem] sm:max-w-md">
                            <p className="truncate font-medium">{envelope.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {envelope.workspaceName} · from {envelope.senderName}
                            </p>
                            <div className="mt-1 sm:hidden">
                              <EnvelopeStatusBadge status={envelope.status} />
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {envelope.status === "draft" ? <span className="text-muted-foreground">Not sent</span> : <SigningProgress done={envelope.completedCount} total={envelope.recipientCount} />}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <EnvelopeStatusBadge status={envelope.status} />
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell" title={formatDate(envelope.updatedAt)}>
                        {formatRelative(envelope.updatedAt)}
                      </TableCell>
                      <TableCell className="pe-5 text-muted-foreground">
                        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination page={envelopes.data.page} pageSize={envelopes.data.pageSize} total={envelopes.data.total} onPage={params.setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
