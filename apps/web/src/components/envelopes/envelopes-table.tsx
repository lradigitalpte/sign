"use client";

import { createColumnHelper } from "@tanstack/react-table";
import {
  Ban,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Download,
  Eye,
  FilePenLine,
  FileText,
  FolderInput,
  Hourglass,
  ListFilter,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
  Trash2,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EnvelopeFolderChips, type FolderSelection } from "@/components/envelopes/envelope-folder-chips";
import { MoveToFolderDialog } from "@/components/envelopes/move-to-folder-dialog";
import { DataTableColumnHeader } from "@/components/shared/data-table-column-header";
import { serverDataTableFeatures, ServerDataTable } from "@/components/shared/server-data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useDataTableUrlState } from "@/hooks/use-data-table-url-state";
import { useEnvelopes, useMe, usePlatformToken } from "@/hooks/use-envelope-api";
import {
  bulkDeleteEnvelopes,
  bulkVoidEnvelopes,
  deleteEnvelope,
  duplicateEnvelope,
  initialsFor,
  listEnvelopeDocuments,
  type Envelope,
  type RecipientSummary,
} from "@/lib/platform-api";
import { resumeSoloSelfSignIfApplicable } from "@/lib/self-sign-flow";

const helper = createColumnHelper<typeof serverDataTableFeatures, Envelope>();

function RecipientAvatarStack({ recipients = [] }: { recipients?: RecipientSummary[] }) {
  const displayRecipients = recipients.length > 0 ? recipients : [];

  return (
    <HoverCard openDelay={80} closeDelay={150}>
      <HoverCardTrigger asChild>
        <div className="inline-flex -space-x-2 items-center cursor-pointer py-1 select-none">
          {displayRecipients.length === 0 ? (
            <>
              <div className="size-7 rounded-full bg-neutral-200 dark:bg-neutral-600 ring-2 ring-background flex items-center justify-center text-[10px] font-bold text-neutral-700 dark:text-neutral-200 shadow-sm" />
              <div className="size-7 rounded-full bg-neutral-200 dark:bg-neutral-600 ring-2 ring-background flex items-center justify-center text-[10px] font-bold text-neutral-700 dark:text-neutral-200 shadow-sm" />
            </>
          ) : (
            <>
              {displayRecipients.slice(0, 3).map((r, i) => (
                <div
                  key={r.id || i}
                  className="size-7 rounded-full bg-neutral-100 dark:bg-neutral-700 ring-2 ring-background flex items-center justify-center text-[11px] font-bold text-neutral-700 dark:text-neutral-200 shadow-sm transition hover:scale-110 hover:z-10"
                >
                  {initialsFor(r.name || r.email || "?")}
                </div>
              ))}
              {displayRecipients.length > 3 && (
                <div className="size-7 rounded-full bg-neutral-200 dark:bg-neutral-600 ring-2 ring-background flex items-center justify-center text-[10px] font-bold text-neutral-700 dark:text-neutral-200 shadow-sm">
                  +{displayRecipients.length - 3}
                </div>
              )}
            </>
          )}
        </div>
      </HoverCardTrigger>

      {/* Render outside the table container via Portal and drop DOWNWARDS (side="bottom") */}
      <HoverCardContent
        side="bottom"
        align="center"
        sideOffset={8}
        className="w-72 p-3"
      >
        <div className="flex items-center justify-between pb-2 border-b text-xs font-semibold">
          <span>Recipients ({displayRecipients.length})</span>
          <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Status</span>
        </div>
        <div className="mt-2 space-y-2 max-h-52 overflow-y-auto">
          {displayRecipients.length === 0 ? (
            <div className="py-2 text-center text-xs text-muted-foreground">
              No recipients added yet
            </div>
          ) : (
            displayRecipients.map((rec) => {
              const isSigned = rec.status === "completed";
              const isViewed = rec.status === "viewed";
              const isSent = rec.status === "sent";
              const isDeclined = rec.status === "declined";

              return (
                <div key={rec.id} className="flex items-center justify-between gap-2 text-xs py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-6 shrink-0 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold">
                      {initialsFor(rec.name || rec.email)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{rec.name || "Signer"}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{rec.email}</p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center">
                    {isSigned ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                        <CheckCircle2 className="size-3" /> Signed
                      </span>
                    ) : isViewed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-500">
                        <Eye className="size-3" /> Viewed
                      </span>
                    ) : isSent ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                        <Mail className="size-3" /> Sent
                      </span>
                    ) : isDeclined ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-500">
                        <XCircle className="size-3" /> Declined
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-500/10 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        <Clock className="size-3" /> Pending
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function EnvelopesTable() {
  const t = useTranslations("Envelopes");
  const tf = useTranslations("Folders");
  const router = useRouter();
  const me = useMe().data?.user;
  const [folder, setFolder] = useState<FolderSelection>("all");
  const folderQuery = folder === "all" ? undefined : folder;
  const envelopesQuery = useEnvelopes(folderQuery);
  const { getAccessToken } = usePlatformToken();
  const [state, setState] = useDataTableUrlState({ pageSize: 10, sortId: "createdAt", sortDescending: true });

  // Filter toolbar state
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedSender, setSelectedSender] = useState<string>("all");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all");

  // Bulk dialogs state
  const [movingEnvelopes, setMovingEnvelopes] = useState<Envelope[]>([]);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [voidingEnvelopes, setVoidingEnvelopes] = useState<Envelope[]>([]);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [deletingEnvelopes, setDeletingEnvelopes] = useState<Envelope[]>([]);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [clearSelectionFn, setClearSelectionFn] = useState<(() => void) | null>(null);

  const rows = envelopesQuery.data ?? [];

  // Extract unique senders
  const uniqueSenders = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const name = r.senderName || me?.name || "Henry";
      if (name) set.add(name);
    });
    return Array.from(set);
  }, [me?.name, rows]);

  // Filter rows by global search, status, sender, period
  const filtered = useMemo(() => {
    const query = state?.globalFilter?.trim()?.toLowerCase() ?? "";
    let result = rows;

    // Filter by Status
    if (selectedStatus !== "all") {
      result = result.filter((row) => row.status === selectedStatus);
    }

    // Filter by Sender
    if (selectedSender !== "all") {
      result = result.filter((row) => {
        const sender = row.senderName || me?.name || "Henry";
        return sender.toLowerCase() === selectedSender.toLowerCase();
      });
    }

    // Filter by Period
    if (selectedPeriod !== "all") {
      const now = Date.now();
      result = result.filter((row) => {
        const itemTime = new Date(row.createdAt).getTime();
        if (selectedPeriod === "7days") {
          return now - itemTime <= 7 * 24 * 60 * 60 * 1000;
        }
        if (selectedPeriod === "30days") {
          return now - itemTime <= 30 * 24 * 60 * 60 * 1000;
        }
        if (selectedPeriod === "year") {
          const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime();
          return itemTime >= startOfYear;
        }
        return true;
      });
    }

    if (query) {
      result = result.filter((row) =>
        `${row.title} ${row.id} ${row.status} ${row.senderName ?? ""}`.toLowerCase().includes(query),
      );
    }

    const sort = state?.sorting?.[0];
    if (!sort) {
      return result;
    }
    const direction = sort.desc ? -1 : 1;
    return [...result].sort((a, b) => {
      const left = a[sort.id as keyof Envelope];
      const right = b[sort.id as keyof Envelope];
      return String(left ?? "").localeCompare(String(right ?? "")) * direction;
    });
  }, [me?.name, rows, selectedPeriod, selectedSender, selectedStatus, state?.globalFilter, state?.sorting]);

  const pageIndex = state?.pagination?.pageIndex ?? 0;
  const pageSize = state?.pagination?.pageSize ?? 10;
  const page = filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  // Bulk actions handlers
  const handleBulkDownload = async (selected: Envelope[]) => {
    setIsActionPending(true);
    try {
      const token = await getAccessToken();
      if (!token) return;

      for (const envelope of selected) {
        try {
          const docs = await listEnvelopeDocuments(token, envelope.id);
          if (docs.length > 0) {
            const firstDoc = docs[0];
            const isCompleted = envelope.status === "completed";
            const downloadUrl = `/api/envelopes/${envelope.id}/documents/${firstDoc.id}/file${isCompleted ? "?version=completed" : ""}`;
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = firstDoc.filename || `${envelope.title}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        } catch {
          // ignore single error in loop
        }
      }
    } finally {
      setIsActionPending(false);
    }
  };

  const confirmBulkVoid = async () => {
    if (voidingEnvelopes.length === 0) return;
    setIsActionPending(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await bulkVoidEnvelopes(
        token,
        voidingEnvelopes.map((e) => e.id),
      );
      await envelopesQuery.refetch();
      clearSelectionFn?.();
      setIsVoidOpen(false);
    } finally {
      setIsActionPending(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (deletingEnvelopes.length === 0) return;
    setIsActionPending(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await bulkDeleteEnvelopes(
        token,
        deletingEnvelopes.map((e) => e.id),
      );
      await envelopesQuery.refetch();
      clearSelectionFn?.();
      setIsDeleteOpen(false);
    } finally {
      setIsActionPending(false);
    }
  };

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "select",
          header: ({ table }) => (
            <input
              type="checkbox"
              className="size-4 rounded border-border bg-background accent-primary cursor-pointer align-middle transition"
              checked={table.getIsAllPageRowsSelected()}
              ref={(input) => {
                if (input) {
                  input.indeterminate = table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected();
                }
              }}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
              aria-label="Select all"
            />
          ),
          cell: ({ row }) => (
            <input
              type="checkbox"
              className="size-4 rounded border-border bg-background accent-primary cursor-pointer align-middle transition"
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              onChange={row.getToggleSelectedHandler()}
              aria-label="Select row"
            />
          ),
          enableSorting: false,
          enableHiding: false,
        }),
        helper.accessor("createdAt", {
          header: ({ column }) => <DataTableColumnHeader column={column} title={t("created")} />,
          cell: ({ getValue }) => {
            const val = getValue();
            if (!val) return <span className="text-xs text-muted-foreground">—</span>;
            const d = new Date(val);
            return (
              <span className="whitespace-nowrap text-xs text-muted-foreground font-medium">
                {d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })},{" "}
                {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </span>
            );
          },
        }),
        helper.accessor("title", {
          header: ({ column }) => <DataTableColumnHeader column={column} title={t("columns.title")} />,
          cell: ({ row }) => (
            <Link
              className="font-medium text-foreground hover:text-primary transition line-clamp-1 break-all"
              href={`/envelopes/${row.original.id}`}
            >
              {row.original.title}
            </Link>
          ),
        }),
        helper.display({
          id: "sender",
          header: t("columns.sender"),
          cell: ({ row }) => {
            const sender = row.original.senderName || me?.name || "Henry";
            return (
              <span className="whitespace-nowrap text-sm text-foreground font-medium">
                {sender}
              </span>
            );
          },
        }),
        helper.display({
          id: "recipients",
          header: t("columns.recipient"),
          cell: ({ row }) => <RecipientAvatarStack recipients={row.original.recipients} />,
        }),
        helper.accessor("status", {
          header: ({ column }) => <DataTableColumnHeader column={column} title={t("columns.status")} />,
          cell: ({ getValue }) => {
            const value = getValue();
            if (value === "draft") {
              return (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-yellow-500 dark:text-yellow-400">
                  <FileText className="size-4 shrink-0 stroke-[1.8]" />
                  <span>Draft</span>
                </span>
              );
            }
            if (value === "completed") {
              return (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-500 dark:text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0 stroke-[1.8]" />
                  <span>Completed</span>
                </span>
              );
            }
            if (value === "in_progress") {
              return (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-500 dark:text-blue-400">
                  <Clock className="size-4 shrink-0 stroke-[1.8]" />
                  <span>In progress</span>
                </span>
              );
            }
            if (value === "voided") {
              return (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-500 dark:text-rose-400">
                  <Ban className="size-4 shrink-0 stroke-[1.8]" />
                  <span>Voided</span>
                </span>
              );
            }
            return (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Hourglass className="size-4 shrink-0 stroke-[1.8]" />
                <span>Expired</span>
              </span>
            );
          },
        }),
        helper.display({
          id: "actions",
          enableHiding: false,
          header: t("actionsColumn"),
          cell: ({ row }) => {
            const isDraft = row.original.status === "draft";
            const editHref = `/envelopes/${row.original.id}/editor`;
            const openHref = `/envelopes/${row.original.id}`;

            return (
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  asChild
                  size="sm"
                  className="bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold gap-1.5 rounded-lg px-4 h-8 shadow-sm transition"
                >
                  <Link href={isDraft ? editHref : openHref}>
                    <Pencil className="size-3.5" />
                    <span>{t("edit")}</span>
                  </Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button aria-label={t("actionsColumn")} size="icon" variant="ghost" className="size-8 rounded-lg">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>{t("actionsColumn")}</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link href={openHref}>
                        <FileText className="size-4" />
                        {t("actions.open")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setMovingEnvelopes([row.original]);
                        setIsMoveOpen(true);
                      }}
                    >
                      <FolderInput className="size-4" />
                      {tf("moveToFolder")}
                    </DropdownMenuItem>
                    {isDraft ? (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href={editHref}>
                            <FilePenLine className="size-4" />
                            {t("edit")}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={async () => {
                            const token = await getAccessToken();
                            if (!token) {
                              return;
                            }
                            await deleteEnvelope(token, row.original.id);
                            await envelopesQuery.refetch();
                          }}
                        >
                          <Trash2 className="size-4" />
                          {t("actions.delete")}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {row.original.status === "completed" || row.original.status === "in_progress" ? (
                      <DropdownMenuItem
                        onClick={async () => {
                          const token = await getAccessToken();
                          if (!token) {
                            return;
                          }
                          const copy = await duplicateEnvelope(token, row.original.id);
                          const resumed = await resumeSoloSelfSignIfApplicable(token, copy.id, me?.email, router);
                          if (!resumed) {
                            router.push(`/envelopes/${copy.id}/editor?self=1`);
                          }
                        }}
                      >
                        <Copy className="size-4" />
                        {t("actions.duplicate")}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          },
        }),
      ]),
    [envelopesQuery, getAccessToken, me?.email, me?.name, router, t, tf],
  );

  return (
    <div className="space-y-4">
      <EnvelopeFolderChips
        selected={folder}
        onSelect={(value) => {
          setFolder(value);
          setState({
            pagination: { pageIndex: 0, pageSize: state?.pagination?.pageSize ?? 10 },
            sorting: state?.sorting ?? [],
            globalFilter: state?.globalFilter ?? "",
            columnFilters: state?.columnFilters ?? [],
          });
        }}
      />

      <ServerDataTable
        columns={columns}
        data={page}
        state={state}
        error={envelopesQuery.error instanceof Error ? envelopesQuery.error : null}
        getRowId={(row) => row.id}
        isLoading={envelopesQuery.isLoading}
        onRetry={() => envelopesQuery.refetch()}
        onStateChange={setState}
        rowCount={filtered.length}
        searchPlaceholder="Search documents…"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl border-dashed">
                  <ListFilter className="size-3.5 text-muted-foreground" />
                  <span>
                    {selectedStatus === "all"
                      ? "Status"
                      : selectedStatus === "draft"
                      ? "Draft"
                      : selectedStatus === "in_progress"
                      ? "In progress"
                      : selectedStatus === "completed"
                      ? "Completed"
                      : selectedStatus === "voided"
                      ? "Voided"
                      : "Expired"}
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setSelectedStatus("all")}>All statuses</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSelectedStatus("draft")}>Draft</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedStatus("in_progress")}>In progress</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedStatus("completed")}>Completed</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedStatus("voided")}>Voided</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedStatus("expired")}>Expired</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sender Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl border-dashed">
                  <User className="size-3.5 text-muted-foreground" />
                  <span>{selectedSender === "all" ? "Sender" : selectedSender}</span>
                  <ChevronDown className="size-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel>Filter by sender</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setSelectedSender("all")}>All senders</DropdownMenuItem>
                <DropdownMenuSeparator />
                {uniqueSenders.map((sender) => (
                  <DropdownMenuItem key={sender} onClick={() => setSelectedSender(sender)}>
                    {sender}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Period Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl border-dashed">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  <span>
                    {selectedPeriod === "all"
                      ? "Period"
                      : selectedPeriod === "7days"
                      ? "Last 7 days"
                      : selectedPeriod === "30days"
                      ? "Last 30 days"
                      : "This year"}
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuLabel>Filter by period</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setSelectedPeriod("all")}>All time</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSelectedPeriod("7days")}>Last 7 days</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedPeriod("30days")}>Last 30 days</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedPeriod("year")}>This year</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {(selectedStatus !== "all" || selectedSender !== "all" || selectedPeriod !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSelectedStatus("all");
                  setSelectedSender("all");
                  setSelectedPeriod("all");
                }}
              >
                Reset filters
              </Button>
            )}
          </div>
        }
        bulkActions={(selectedRows, clearSelection) => (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl bg-neutral-900/95 dark:bg-neutral-900/95 border border-white/10 dark:border-white/15 px-4 py-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl text-white animate-in fade-in slide-in-from-bottom-5 duration-200">
            <div className="flex items-center gap-1.5 pr-2 border-r border-white/15 text-xs font-semibold">
              <span className="flex size-5 items-center justify-center rounded-full bg-[#a3e635] text-[11px] font-bold text-black shadow-sm">
                {selectedRows.length}
              </span>
              <span>selected</span>
            </div>

            <div className="flex items-center gap-1">
              {/* Bulk Move */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-white/90 hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setMovingEnvelopes(selectedRows);
                  setClearSelectionFn(() => clearSelection);
                  setIsMoveOpen(true);
                }}
              >
                <FolderInput className="size-3.5" />
                <span>Move</span>
              </Button>

              {/* Bulk Download */}
              <Button
                variant="ghost"
                size="sm"
                disabled={isActionPending}
                className="h-8 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-white/90 hover:bg-white/10 hover:text-white"
                onClick={() => handleBulkDownload(selectedRows)}
              >
                {isActionPending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                <span>Download</span>
              </Button>

              {/* Bulk Cancel / Void */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-white/90 hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setVoidingEnvelopes(selectedRows);
                  setClearSelectionFn(() => clearSelection);
                  setIsVoidOpen(true);
                }}
              >
                <XCircle className="size-3.5" />
                <span>Cancel</span>
              </Button>

              {/* Bulk Delete */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
                onClick={() => {
                  setDeletingEnvelopes(selectedRows);
                  setClearSelectionFn(() => clearSelection);
                  setIsDeleteOpen(true);
                }}
              >
                <Trash2 className="size-3.5" />
                <span>Delete</span>
              </Button>
            </div>

            <div className="pl-1 border-l border-white/15">
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white transition"
                title="Clear selection"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}
      />

      {/* Bulk Move Dialog */}
      <MoveToFolderDialog
        envelopes={movingEnvelopes}
        open={isMoveOpen}
        onOpenChange={setIsMoveOpen}
        onSuccess={() => {
          clearSelectionFn?.();
          setMovingEnvelopes([]);
        }}
      />

      {/* Bulk Void Confirmation Dialog */}
      <Dialog open={isVoidOpen} onOpenChange={setIsVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel / Void Agreements</DialogTitle>
            <DialogDescription>
              Are you sure you want to void {voidingEnvelopes.length} selected agreement
              {voidingEnvelopes.length > 1 ? "s" : ""}? Recipients will no longer be able to view or sign them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsVoidOpen(false)}>
              Back
            </Button>
            <Button variant="destructive" disabled={isActionPending} onClick={confirmBulkVoid}>
              {isActionPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm Void
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Envelopes</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deletingEnvelopes.length} selected envelope
              {deletingEnvelopes.length > 1 ? "s" : ""}? Draft agreements will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isActionPending} onClick={confirmBulkDelete}>
              {isActionPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
