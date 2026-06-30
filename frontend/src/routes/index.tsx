import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { IssueTable } from "@/components/issue-table";
import {
  applyFilters,
  buildGroups,
  paramsToFilters,
  paramsToSort,
  type Sort,
  sortIssues,
  sortToParams,
} from "@/lib/filter";
import { useIssues } from "@/queries";

export const Route = createFileRoute("/")({
  component: Table,
});

function Table() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { data, isLoading, error } = useIssues();
  const grouped = search.grp === true;

  const filters = paramsToFilters(search);
  const sort = paramsToSort(search);
  const rows = useMemo(
    () => sortIssues(applyFilters(data ?? [], filters), sort),
    [data, filters, sort],
  );
  const groups = useMemo(() => (grouped ? buildGroups(rows) : undefined), [grouped, rows]);

  const onSortChange = (s: Sort) =>
    navigate({ to: ".", search: (p) => ({ ...p, ...sortToParams(s) }) });
  const select = (id: string) => navigate({ to: ".", search: (s) => ({ ...s, issue: id }) });
  const toggleGroup = () =>
    navigate({ to: ".", search: (s) => ({ ...s, grp: grouped ? undefined : true }) });

  if (isLoading) {
    return <p className="text-muted">loading…</p>;
  }
  if (error) {
    return <p className="text-st-blocked">error: {error.message}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex w-fit cursor-pointer items-center gap-2 text-muted text-sm">
        <input type="checkbox" checked={grouped} onChange={toggleGroup} className="accent-accent" />
        group by epic
      </label>
      <IssueTable
        rows={rows}
        groups={groups}
        sort={sort}
        onSortChange={onSortChange}
        onSelect={select}
      />
    </div>
  );
}
