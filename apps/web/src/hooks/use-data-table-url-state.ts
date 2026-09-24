"use client";

import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { ServerDataTableState } from "@/components/shared/server-data-table";

type DataTableUrlDefaults = {
  pageSize?: number;
  sortId?: string;
  sortDescending?: boolean;
};

export function useDataTableUrlState(defaults: DataTableUrlDefaults = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultPageSize = defaults.pageSize ?? 25;

  const state = useMemo<ServerDataTableState>(() => {
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const size = Math.max(1, Number(searchParams.get("size")) || defaultPageSize);
    const sortId = searchParams.get("sort") ?? defaults.sortId;
    const direction = searchParams.get("direction");
    const sorting: SortingState = sortId
      ? [{ id: sortId, desc: direction ? direction === "desc" : (defaults.sortDescending ?? false) }]
      : [];
    const columnFilters: ColumnFiltersState = [];

    for (const [key, value] of searchParams.entries()) {
      if (key.startsWith("filter.")) {
        columnFilters.push({ id: key.slice(7), value });
      }
    }

    return {
      pagination: { pageIndex: page - 1, pageSize: size },
      sorting,
      globalFilter: searchParams.get("q") ?? "",
      columnFilters,
    };
  }, [defaultPageSize, defaults.sortDescending, defaults.sortId, searchParams]);

  const setState = useCallback(
    (next: Partial<ServerDataTableState>) => {
      const params = new URLSearchParams(searchParams.toString());

      const pageIndex = next.pagination?.pageIndex ?? 0;
      const pageSize = next.pagination?.pageSize ?? defaultPageSize;

      if (pageIndex > 0) params.set("page", String(pageIndex + 1));
      else params.delete("page");
      if (pageSize !== defaultPageSize) params.set("size", String(pageSize));
      else params.delete("size");
      if (next.globalFilter) params.set("q", next.globalFilter);
      else params.delete("q");

      const [sort] = next.sorting ?? [];
      if (sort) {
        params.set("sort", sort.id);
        params.set("direction", sort.desc ? "desc" : "asc");
      } else {
        params.delete("sort");
        params.delete("direction");
      }

      for (const key of [...params.keys()]) {
        if (key.startsWith("filter.")) params.delete(key);
      }
      if (next.columnFilters) {
        for (const filter of next.columnFilters) {
          if (typeof filter.value === "string" && filter.value) {
            params.set(`filter.${filter.id}`, filter.value);
          }
        }
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [defaultPageSize, pathname, router, searchParams],
  );

  return [state, setState] as const;
}
