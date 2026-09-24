"use client";

import { keepPreviousData, useQuery, type QueryKey } from "@tanstack/react-query";

import type { ServerDataTableState } from "@/components/shared/server-data-table";
import { dataTableStateToSearchParams, type DataTablePage } from "@/lib/data-table-query";

type UseServerDataTableQueryOptions = {
  queryKey: QueryKey;
  endpoint: string;
  state: ServerDataTableState;
  enabled?: boolean;
};

export function useServerDataTableQuery<TData>({
  enabled = true,
  endpoint,
  queryKey,
  state,
}: UseServerDataTableQueryOptions) {
  return useQuery({
    queryKey: [...queryKey, endpoint, state],
    queryFn: async ({ signal }) => {
      const params = dataTableStateToSearchParams(state);
      const response = await fetch(`${endpoint}?${params}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
        signal,
      });

      if (!response.ok) {
        throw new Error(`Table request failed with status ${response.status}`);
      }

      return response.json() as Promise<DataTablePage<TData>>;
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}
