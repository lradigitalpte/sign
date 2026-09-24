"use client";

import {
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Columns3,
  RotateCw,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const serverDataTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
});

export type ServerDataTableColumn<TData extends RowData> = ColumnDef<
  typeof serverDataTableFeatures,
  TData,
  unknown
>;

export type ServerDataTableState = {
  pagination: PaginationState;
  sorting: SortingState;
  globalFilter: string;
  columnFilters: ColumnFiltersState;
};

type ServerDataTableProps<TData extends RowData> = {
  columns: ServerDataTableColumn<TData>[];
  data: TData[];
  rowCount: number;
  state: ServerDataTableState;
  onStateChange: (state: ServerDataTableState) => void;
  getRowId: (row: TData) => string;
  isLoading?: boolean;
  isFetching?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  bulkActions?: (selectedRows: TData[], clearSelection: () => void) => ReactNode;
  pageSizeOptions?: number[];
  className?: string;
};

function DebouncedSearchInput({
  ariaLabel,
  onChange,
  placeholder,
  value,
}: {
  ariaLabel: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const [inputValue, setInputValue] = useState(value);
  const debouncedValue = useDebouncedValue(inputValue);

  useEffect(() => {
    if (debouncedValue !== value) onChange(debouncedValue);
  }, [debouncedValue, onChange, value]);

  return (
    <Input
      aria-label={ariaLabel}
      className="ps-9"
      onChange={(event) => setInputValue(event.target.value)}
      placeholder={placeholder}
      value={inputValue}
    />
  );
}

export function ServerDataTable<TData extends RowData>({
  bulkActions,
  className,
  columns,
  data,
  error,
  getRowId,
  isFetching = false,
  isLoading = false,
  onRetry,
  onStateChange,
  pageSizeOptions = [10, 25, 50, 100],
  rowCount,
  searchPlaceholder,
  state,
  toolbar,
}: ServerDataTableProps<TData>) {
  const t = useTranslations("DataTable");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});

  const safeState: ServerDataTableState = useMemo(
    () => ({
      pagination: state?.pagination ?? { pageIndex: 0, pageSize: 10 },
      sorting: state?.sorting ?? [],
      globalFilter: state?.globalFilter ?? "",
      columnFilters: state?.columnFilters ?? [],
    }),
    [state],
  );

  const updateState = useCallback(
    (patch: Partial<ServerDataTableState>) => onStateChange({ ...safeState, ...patch }),
    [onStateChange, safeState],
  );

  const updateSearch = useCallback(
    (globalFilter: string) => {
      updateState({
        globalFilter,
        pagination: { ...safeState.pagination, pageIndex: 0 },
      });
    },
    [safeState.pagination, updateState],
  );

  const table = useTable(
    {
      features: serverDataTableFeatures,
      columns,
      data,
      rowCount,
      getRowId,
      manualFiltering: true,
      manualSorting: true,
      manualPagination: true,
      state: {
        pagination: safeState.pagination,
        sorting: safeState.sorting,
        globalFilter: safeState.globalFilter,
        columnFilters: safeState.columnFilters,
        rowSelection,
        columnVisibility,
      },
      onPaginationChange: (updater) => {
        const pagination = typeof updater === "function" ? updater(safeState.pagination) : updater;
        updateState({ pagination });
      },
      onSortingChange: (updater) => {
        const sorting = typeof updater === "function" ? updater(safeState.sorting) : updater;
        updateState({ sorting, pagination: { ...safeState.pagination, pageIndex: 0 } });
      },
      onGlobalFilterChange: (updater) => {
        const globalFilter = typeof updater === "function" ? updater(safeState.globalFilter) : updater;
        updateState({ globalFilter, pagination: { ...safeState.pagination, pageIndex: 0 } });
      },
      onColumnFiltersChange: (updater) => {
        const columnFilters = typeof updater === "function" ? updater(safeState.columnFilters) : updater;
        updateState({ columnFilters, pagination: { ...safeState.pagination, pageIndex: 0 } });
      },
      onRowSelectionChange: setRowSelection,
      onColumnVisibilityChange: setColumnVisibility,
    },
    (tableState) => tableState,
  );

  const selectedRows = table.getSelectedRowModel().flatRows.map((row) => row.original);
  const pageCount = Math.max(1, Math.ceil(rowCount / safeState.pagination.pageSize));

  return (
    <div className={cn("space-y-3", className)} data-slot="server-data-table">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <DebouncedSearchInput
              ariaLabel={searchPlaceholder ?? t("search")}
              key={safeState.globalFilter}
              onChange={updateSearch}
              placeholder={searchPlaceholder ?? t("search")}
              value={safeState.globalFilter}
            />
          </div>
          {toolbar}
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          {isFetching && !isLoading ? <RotateCw className="size-4 animate-spin text-muted-foreground" /> : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline"><Columns3 /> {t("columns")}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => (
                <DropdownMenuCheckboxItem
                  checked={column.getIsVisible()}
                  key={column.id}
                  onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
                >
                  {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {selectedRows.length > 0 && bulkActions ? (
        bulkActions(selectedRows, () => setRowSelection({}))
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border bg-card/85 shadow-[inset_0_1px_0_color-mix(in_oklch,white_65%,transparent),0_14px_34px_-28px_color-mix(in_oklch,var(--foreground)_24%,transparent)] backdrop-blur-sm">
        <Table>
          <TableHeader className="bg-surface-subtle">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow className="hover:bg-transparent" key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead className="h-11 px-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground" key={header.id}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: Math.min(safeState.pagination.pageSize, 8) }).map((_, rowIndex) => (
                <TableRow aria-label={t("loading")} key={rowIndex}>
                  {table.getVisibleLeafColumns().map((column) => (
                    <TableCell className="px-4 py-4" key={column.id}>
                      <div className="h-4 animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell className="h-40 text-center" colSpan={Math.max(1, table.getVisibleLeafColumns().length)}>
                  <p className="font-medium">{t("errorTitle")}</p>
                  {onRetry ? <Button className="mt-3" onClick={onRetry} variant="outline"><RotateCw /> {t("retry")}</Button> : null}
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow data-state={row.getIsSelected() ? "selected" : undefined} key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell className="px-4 py-3.5" key={cell.id}><table.FlexRender cell={cell} /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-40 text-center text-muted-foreground" colSpan={Math.max(1, table.getVisibleLeafColumns().length)}>
                  {t("noResults")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {isFetching && !isLoading ? <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-primary" /> : null}
      </div>

      <div className="flex flex-col gap-3 px-1 pt-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>{t("results", { count: rowCount })}</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs">{t("rowsPerPage")}</span>
            <Select
              value={String(safeState.pagination.pageSize)}
              onValueChange={(val) => table.setPageSize(Number(val))}
            >
              <SelectTrigger className="h-8 w-20 rounded-xl text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="min-w-24 text-center text-foreground">{t("page", { page: safeState.pagination.pageIndex + 1, pages: pageCount })}</span>
          <Button aria-label={t("firstPage")} disabled={!table.getCanPreviousPage()} onClick={() => table.firstPage()} size="icon" variant="outline"><ChevronFirst /></Button>
          <Button aria-label={t("previousPage")} disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} size="icon" variant="outline"><ChevronLeft /></Button>
          <Button aria-label={t("nextPage")} disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} size="icon" variant="outline"><ChevronRight /></Button>
          <Button aria-label={t("lastPage")} disabled={!table.getCanNextPage()} onClick={() => table.lastPage()} size="icon" variant="outline"><ChevronLast /></Button>
        </div>
      </div>
    </div>
  );
}
