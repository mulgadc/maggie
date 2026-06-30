import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { IssueTable } from "@/components/issue-table";
import {
  applyFilters,
  buildGroups,
  buildLabelGroups,
  paramsToFilters,
  paramsToSort,
  type Sort,
  sortIssues,
  sortToParams,
} from "@/lib/filter";
import { useIssues } from "@/queries";

export const Route = createFileRoute("/table")({
  component: Table,
});

function Table() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { data, isLoading, error } = useIssues();
  const mode = search.group ?? "none";

  const filters = paramsToFilters(search);
  const sort = paramsToSort(search);
  const rows = useMemo(
    () => sortIssues(applyFilters(data ?? [], filters), sort),
    [data, filters, sort],
  );
  const groups = useMemo(() => (mode === "epic" ? buildGroups(rows) : undefined), [mode, rows]);
  const labelGroups = useMemo(
    () => (mode === "label" ? buildLabelGroups(rows) : undefined),
    [mode, rows],
  );

  const onSortChange = (s: Sort) =>
    navigate({ to: ".", search: (p) => ({ ...p, ...sortToParams(s) }) });
  const select = (id: string) => navigate({ to: ".", search: (s) => ({ ...s, issue: id }) });

  if (isLoading) {
    return <p className="text-muted">loading…</p>;
  }
  if (error) {
    return <p className="text-st-blocked">error: {error.message}</p>;
  }

  return (
    <IssueTable
      rows={rows}
      groups={groups}
      labelGroups={labelGroups}
      sort={sort}
      onSortChange={onSortChange}
      onSelect={select}
    />
  );
}
