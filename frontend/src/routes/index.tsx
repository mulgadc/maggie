import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { IssueTable } from "@/components/issue-table";
import {
  type Filters,
  paramsToFilters,
  paramsToSort,
  type Sort,
  type TableSearch,
  toParams,
} from "@/lib/filter";
import { useIssues } from "@/queries";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): TableSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    idg: typeof search.idg === "string" ? search.idg : undefined,
    st: typeof search.st === "string" ? search.st : undefined,
    pri: search.pri === undefined ? undefined : Number(search.pri),
    type: typeof search.type === "string" ? search.type : undefined,
    asgn: typeof search.asgn === "string" ? search.asgn : undefined,
    sort: typeof search.sort === "string" ? (search.sort as TableSearch["sort"]) : undefined,
    dir: search.dir === "desc" ? "desc" : search.dir === "asc" ? "asc" : undefined,
  }),
  component: Table,
});

function Table() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { data, isLoading, error } = useIssues();

  const filters = paramsToFilters(search);
  const sort = paramsToSort(search);

  const push = (f: Filters, s: Sort) =>
    navigate({ to: ".", search: (prev) => ({ ...prev, ...toParams(f, s) }) });

  const select = (id: string) => navigate({ to: ".", search: (s) => ({ ...s, issue: id }) });

  if (isLoading) {
    return <p className="text-muted">loading…</p>;
  }
  if (error) {
    return <p className="text-st-blocked">error: {error.message}</p>;
  }

  return (
    <IssueTable
      issues={data ?? []}
      filters={filters}
      sort={sort}
      onFiltersChange={(f) => push(f, sort)}
      onSortChange={(s) => push(filters, s)}
      onSelect={select}
    />
  );
}
