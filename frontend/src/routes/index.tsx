import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { IssueTable } from "@/components/issue-table";
import { useIssues } from "@/queries";

export const Route = createFileRoute("/")({
  component: Table,
});

function Table() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useIssues();

  const select = (id: string) => navigate({ to: ".", search: (s) => ({ ...s, issue: id }) });

  if (isLoading) {
    return <p className="text-muted">loading…</p>;
  }
  if (error) {
    return <p className="text-st-blocked">error: {error.message}</p>;
  }

  return <IssueTable issues={data ?? []} onSelect={select} />;
}
