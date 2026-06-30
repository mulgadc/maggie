import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import type { Issue, Status } from "@/api";
import { IssueCard } from "@/components/issue-card";
import { applyFilters, paramsToFilters } from "@/lib/filter";
import { useIssues } from "@/queries";

export const Route = createFileRoute("/board")({
  component: Board,
});

const COLUMNS: Status[] = ["open", "in_progress", "blocked", "deferred", "closed"];

function Board() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { data, isLoading, error } = useIssues();

  const filters = paramsToFilters(search);
  const items = useMemo(() => applyFilters(data ?? [], filters), [data, filters]);

  const select = (id: string) => navigate({ to: ".", search: (s) => ({ ...s, issue: id }) });

  if (isLoading) {
    return <p className="text-muted">loading…</p>;
  }
  if (error) {
    return <p className="text-st-blocked">error: {error.message}</p>;
  }

  const grouped = new Map<Status, Issue[]>(COLUMNS.map((s) => [s, []]));
  for (const issue of items) {
    grouped.get(issue.status)?.push(issue);
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
      {COLUMNS.map((status) => (
        <section key={status}>
          <h2 className="mb-2 text-muted text-xs uppercase tracking-widest">
            {status.replace("_", " ")} ({grouped.get(status)?.length ?? 0})
          </h2>
          {grouped.get(status)?.map((issue) => (
            <IssueCard key={issue.id} issue={issue} onSelect={select} />
          ))}
        </section>
      ))}
    </div>
  );
}
