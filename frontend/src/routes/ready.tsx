import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { IssueCard } from "@/components/issue-card";
import { applyFilters, paramsToFilters } from "@/lib/filter";
import { useReady } from "@/queries";

export const Route = createFileRoute("/ready")({
  component: Ready,
});

function Ready() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { data, isLoading, error } = useReady();

  const filters = paramsToFilters(search);
  const items = useMemo(() => applyFilters(data ?? [], filters), [data, filters]);

  const select = (id: string) => navigate({ to: ".", search: (s) => ({ ...s, issue: id }) });

  if (isLoading) {
    return <p className="text-muted">loading…</p>;
  }
  if (error) {
    return <p className="text-st-blocked">error: {error.message}</p>;
  }

  return (
    <div className="max-w-2xl">
      <h2 className="mb-2 text-muted text-xs uppercase tracking-widest">ready ({items.length})</h2>
      {items.map((issue) => (
        <IssueCard key={issue.id} issue={issue} onSelect={select} />
      ))}
    </div>
  );
}
