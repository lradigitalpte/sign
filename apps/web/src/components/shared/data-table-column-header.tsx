"use client";

import type { Column, RowData } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { serverDataTableFeatures } from "@/components/shared/server-data-table";

type DataTableColumnHeaderProps<TData extends RowData, TValue> = {
  column: Column<typeof serverDataTableFeatures, TData, TValue>;
  title: string;
};

export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  title,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const t = useTranslations("DataTable");
  const sorted = column.getIsSorted();

  if (!column.getCanSort()) return <span>{title}</span>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="-ms-3 h-8 px-3 text-xs uppercase tracking-[0.08em]" variant="ghost">
          {title}
          {sorted === "asc" ? <ArrowUp /> : sorted === "desc" ? <ArrowDown /> : <ChevronsUpDown />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 p-1.5">
        <DropdownMenuItem className="min-h-9 gap-2.5 whitespace-nowrap px-2.5 py-2" onSelect={() => column.toggleSorting(false)}>
          <ArrowUp /> {t("sortAscending")}
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-9 gap-2.5 whitespace-nowrap px-2.5 py-2" onSelect={() => column.toggleSorting(true)}>
          <ArrowDown /> {t("sortDescending")}
        </DropdownMenuItem>
        {sorted ? (
          <DropdownMenuItem className="min-h-9 gap-2.5 whitespace-nowrap px-2.5 py-2" onSelect={() => column.clearSorting()}>
            <X /> {t("clearSort")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
