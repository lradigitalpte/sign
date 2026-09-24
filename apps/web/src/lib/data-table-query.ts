import type { ServerDataTableState } from "@/components/shared/server-data-table";

export type DataTablePage<TData> = {
  items: TData[];
  totalCount: number;
};

export function dataTableStateToSearchParams(state: ServerDataTableState) {
  const params = new URLSearchParams({
    page: String(state.pagination.pageIndex + 1),
    limit: String(state.pagination.pageSize),
  });
  const [sort] = state.sorting;

  if (state.globalFilter) params.set("q", state.globalFilter);
  if (sort) {
    params.set("sort", sort.id);
    params.set("direction", sort.desc ? "desc" : "asc");
  }
  for (const filter of state.columnFilters) {
    if (typeof filter.value === "string" && filter.value) {
      params.set(`filter.${filter.id}`, filter.value);
    }
  }

  return params;
}
