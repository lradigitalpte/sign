"use client";

import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  className?: string;
};

function DataTable<T>({
  className,
  columns,
  empty,
  rowKey,
  rows,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div
      className={cn("overflow-hidden rounded-2xl border bg-card shadow-xs", className)}
      data-slot="data-table"
    >
      <Table>
        <TableHeader className="bg-surface-subtle">
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                className={cn(
                  "h-11 px-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground",
                  column.className,
                )}
                key={column.key}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((column) => (
                <TableCell className={cn("px-4 py-3.5", column.className)} key={column.key}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export { DataTable };
export type { DataTableColumn };
