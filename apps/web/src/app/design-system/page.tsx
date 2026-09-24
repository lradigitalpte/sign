"use client";

import {
  ArrowUpRight,
  Check,
  FilePlus2,
  FileText,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

import { AppShell } from "@/components/shared/app-shell";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

type EnvelopeRow = {
  id: string;
  title: string;
  recipient: string;
  status: "Draft" | "In progress" | "Completed";
  updated: string;
};

const rows: EnvelopeRow[] = [
  {
    id: "env_1",
    title: "Master services agreement",
    recipient: "Morgan Lee",
    status: "In progress",
    updated: "12 minutes ago",
  },
  {
    id: "env_2",
    title: "Mutual NDA",
    recipient: "Jordan Kim",
    status: "Completed",
    updated: "Yesterday",
  },
  {
    id: "env_3",
    title: "Contractor agreement",
    recipient: "Taylor Smith",
    status: "Draft",
    updated: "Aug 27, 2026",
  },
];

const statusTone = {
  Draft: "neutral",
  "In progress": "warning",
  Completed: "success",
} as const;

const columns: DataTableColumn<EnvelopeRow>[] = [
  {
    key: "title",
    header: "Envelope",
    cell: (row) => (
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <FileText aria-hidden="true" className="size-4" />
        </div>
        <div>
          <p className="font-semibold tracking-[-0.01em]">{row.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.id}</p>
        </div>
      </div>
    ),
  },
  { key: "recipient", header: "Recipient", cell: (row) => row.recipient },
  {
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge>,
  },
  {
    key: "updated",
    header: "Updated",
    className: "text-right",
    cell: (row) => <span className="text-muted-foreground">{row.updated}</span>,
  },
  {
    key: "actions",
    header: <span className="sr-only">Actions</span>,
    className: "w-14 text-right",
    cell: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Open envelope actions" size="icon" variant="ghost">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem>
            <ArrowUpRight /> Open envelope
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Send /> Send reminder
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">
            <Trash2 /> Delete draft
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

export default function DesignSystemPage() {
  return (
    <AppShell
      actions={
        <>
          <Button variant="outline">
            <FilePlus2 /> Use template
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus /> New envelope
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create an envelope</DialogTitle>
                <DialogDescription>
                  Give the envelope a clear internal title. Recipients can receive a different public title later.
                </DialogDescription>
              </DialogHeader>
              <FormField htmlFor="envelope-title" label="Envelope title">
                <Input id="envelope-title" placeholder="e.g. Master services agreement" />
              </FormField>
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button>Create draft</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
      description="A reusable visual foundation for authoring, sending, and tracking secure agreements."
      title="Design system"
    >
      <section aria-labelledby="tokens-title" className="grid gap-5 xl:grid-cols-[1fr_0.75fr]">
        <div className="rounded-2xl border bg-card p-6 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Foundation</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]" id="tokens-title">
                Calm, precise, and trustworthy
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Neutral document surfaces keep attention on the agreement. Emerald marks primary action and verified progress.
              </p>
            </div>
            <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles aria-hidden="true" className="size-4" />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Primary", "bg-primary"],
              ["Surface", "bg-background"],
              ["Success", "bg-success"],
              ["Warning", "bg-warning"],
            ].map(([label, color]) => (
              <div className="rounded-xl border bg-surface-subtle p-2" key={label}>
                <div className={`h-16 rounded-lg border ${color}`} />
                <p className="mt-2 text-xs font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Status language</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <StatusBadge>Draft</StatusBadge>
            <StatusBadge tone="info">Ready</StatusBadge>
            <StatusBadge tone="warning">In progress</StatusBadge>
            <StatusBadge tone="success">Completed</StatusBadge>
            <StatusBadge tone="danger">Rejected</StatusBadge>
          </div>
          <div className="mt-7 grid gap-2">
            <Button className="justify-between" size="lg">
              Prepare an envelope <ArrowUpRight />
            </Button>
            <Button variant="outline">Review security settings</Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="table-title" className="mt-8">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.025em]" id="table-title">Envelope table</h2>
            <p className="mt-1 text-sm text-muted-foreground">Reusable operational data with responsive overflow.</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search envelopes" className="pl-9" placeholder="Search envelopes" />
          </div>
        </div>
        <DataTable columns={columns} rowKey={(row) => row.id} rows={rows} />
      </section>

      <section aria-labelledby="forms-title" className="mt-8 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6 shadow-xs">
          <h2 className="text-lg font-semibold tracking-[-0.025em]" id="forms-title">Form fields</h2>
          <p className="mt-1 text-sm text-muted-foreground">Labels, guidance, errors, and optional states remain consistent.</p>
          <div className="mt-6 grid gap-5">
            <FormField
              description="Used internally and shown in your dashboard."
              htmlFor="document-name"
              label="Document name"
            >
              <Input defaultValue="Master services agreement" id="document-name" />
            </FormField>
            <FormField error="Enter a valid recipient email address." htmlFor="recipient-email" label="Recipient email">
              <Input aria-invalid="true" id="recipient-email" placeholder="name@company.com" />
            </FormField>
            <FormField htmlFor="reference" label="Internal reference" optional>
              <Input id="reference" placeholder="CRM-1042" />
            </FormField>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-xs">
          <h2 className="text-lg font-semibold tracking-[-0.025em]">Empty states</h2>
          <p className="mt-1 text-sm text-muted-foreground">Helpful next actions without visual noise.</p>
          <EmptyState
            action={
              <Button>
                <Plus /> Create template
              </Button>
            }
            className="mt-6 min-h-64"
            description="Save recipient roles and fields once, then create consistent envelopes in a few clicks."
            icon={FileText}
            secondaryAction={<Button variant="ghost">Learn about templates</Button>}
            title="No templates yet"
          />
        </div>
      </section>

      <div className="mt-8 flex items-center gap-2 rounded-2xl border border-success/20 bg-success/10 p-4 text-sm text-success-foreground">
        <Check aria-hidden="true" className="size-4" />
        Components use semantic tokens, accessible primitives, and shared interaction states.
      </div>
    </AppShell>
  );
}
