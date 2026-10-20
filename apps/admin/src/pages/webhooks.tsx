import { ChevronRight, CircleAlert, LoaderCircle, RotateCcw, Webhook } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@signet/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@signet/ui/components/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@signet/ui/components/table";

import { Notice } from "@/components/action-dialog";
import { useCan } from "@/lib/admin-context";
import { Badge, Card, ErrorState, Loading, PageHeader, Pagination, SearchField } from "@/components/page";
import { StatusFilter } from "@/components/status-filter";
import { apiUrl, useAdminAction, useWebhookEvent, useWebhookEvents } from "@/lib/api";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import type { WebhookEvent } from "@/lib/types";
import { useListParams } from "@/lib/use-list-params";

const filterOptions = [
  { value: "", label: "All" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
  { value: "processed", label: "Processed" },
];

function StateBadge({ state }: { state: WebhookEvent["state"] }) {
  if (state === "processed") return <Badge tone="success">Processed</Badge>;
  if (state === "failed") return <Badge tone="danger">Failed</Badge>;
  return <Badge tone="warning">Pending</Badge>;
}

function EventDialog({ id, onClose, onDone }: { id: string | null; onClose: () => void; onDone: (message: string) => void }) {
  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">{id ? <EventDetails key={id} id={id} onClose={onClose} onDone={onDone} /> : null}</DialogContent>
    </Dialog>
  );
}

function EventDetails({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (message: string) => void }) {
  const event = useWebhookEvent(id);
  const reprocess = useAdminAction<WebhookEvent>();
  const canReprocess = useCan("support");
  if (event.isPending) return <Loading />;
  if (event.error) return <ErrorState error={event.error} onRetry={() => void event.refetch()} />;
  const e = event.data;

  const submit = (form: FormEvent) => {
    form.preventDefault();
    reprocess.mutate(
      { method: "POST", path: `/webhooks/${encodeURIComponent(id)}/reprocess`, body: { reason: "" } },
      {
        onSuccess: (result) => {
          onDone(result.state === "processed" ? `Reprocessed: ${result.outcome ?? "done"}` : `Still failing: ${result.error ?? "unknown error"}`);
          onClose();
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2 pe-8">
          <DialogTitle className="font-mono">{e.eventType}</DialogTitle>
          <StateBadge state={e.state} />
        </div>
        <DialogDescription>
          Received {formatDateTime(e.receivedAt)} · WorkOS event <span className="font-mono">{e.providerEventId}</span>
        </DialogDescription>
      </DialogHeader>

      {e.outcome ? <p className="rounded-xl bg-muted/50 p-3 text-sm">{e.outcome}</p> : null}
      {e.error ? (
        <p className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-800 dark:text-red-200">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {e.error}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <p className="text-sm font-medium">Payload</p>
        <pre className="max-h-80 overflow-auto rounded-xl border bg-muted/40 p-3 font-mono text-xs">{JSON.stringify(e.payload, null, 2)}</pre>
      </div>

      {reprocess.error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {reprocess.error.message}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        {canReprocess ? (
          <Button type="submit" disabled={reprocess.isPending} title="Apply the event again, e.g. after fixing what made it fail">
            {reprocess.isPending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
            Reprocess
          </Button>
        ) : null}
      </DialogFooter>
    </form>
  );
}

function SetupHint() {
  return (
    <div className="px-6 py-14 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Webhook className="size-5" />
      </span>
      <p className="mt-4 font-medium">No webhook events yet</p>
      <div className="mx-auto mt-2 max-w-lg space-y-1 text-sm text-muted-foreground">
        <p>To receive them, add an endpoint in the WorkOS dashboard (Developer → Webhooks):</p>
        <p>
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{apiUrl}/webhooks/workos</code>
        </p>
        <p>
          Then set its signing secret as <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">WORKOS_WEBHOOK_SECRET</code> for the API. Locally, WorkOS needs a tunnel (such as ngrok) to reach your machine.
        </p>
      </div>
    </div>
  );
}

export function WebhooksPage() {
  const params = useListParams();
  const events = useWebhookEvents({ query: params.query, status: params.status, page: params.page });
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const total = events.data?.total;
  const filtered = Boolean(params.query || params.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description={
          total === undefined
            ? "Events WorkOS sends about users and organizations."
            : `${formatNumber(total)} WorkOS ${total === 1 ? "event" : "events"}${filtered ? " match" : ""} · profile changes and organization renames are applied automatically`
        }
      />
      <Notice message={notice} onDismiss={() => setNotice(null)} />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchField value={params.draft} onChange={params.setDraft} placeholder="Search event type, ID, email" />
          <StatusFilter value={params.status} onChange={params.setStatus} options={filterOptions} />
        </div>

        {events.isPending ? (
          <Loading />
        ) : events.error ? (
          <ErrorState error={events.error} onRetry={() => void events.refetch()} />
        ) : events.data.items.length === 0 ? (
          filtered ? (
            <p className="px-6 py-14 text-center text-sm text-muted-foreground">No events match.</p>
          ) : (
            <SetupHint />
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="ps-5">Event</TableHead>
                  <TableHead className="hidden md:table-cell">Result</TableHead>
                  <TableHead className="hidden sm:table-cell">Received</TableHead>
                  <TableHead className="w-10 pe-5" aria-label="Open" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.data.items.map((event) => {
                  const show = () => setOpen(event.id);
                  return (
                    <TableRow key={event.id} className="group cursor-pointer" tabIndex={0} onClick={show} onKeyDown={(key) => key.key === "Enter" && show()}>
                      <TableCell className="ps-5">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-mono text-sm">{event.eventType}</span>
                          <StateBadge state={event.state} />
                        </div>
                        <p className="mt-0.5 max-w-xs truncate font-mono text-[11px] text-muted-foreground md:hidden">{event.error ?? event.outcome}</p>
                      </TableCell>
                      <TableCell className="hidden max-w-md md:table-cell">
                        <p className={event.error ? "truncate text-sm text-red-700 dark:text-red-300" : "truncate text-sm text-muted-foreground"} title={event.error ?? event.outcome ?? undefined}>
                          {event.error ?? event.outcome ?? "Waiting to be applied"}
                        </p>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell" title={formatDateTime(event.receivedAt)}>
                        {formatRelative(event.receivedAt)}
                      </TableCell>
                      <TableCell className="pe-5 text-muted-foreground">
                        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination page={events.data.page} pageSize={events.data.pageSize} total={events.data.total} onPage={params.setPage} />
          </>
        )}
      </Card>

      <EventDialog id={open} onClose={() => setOpen(null)} onDone={setNotice} />
    </div>
  );
}
