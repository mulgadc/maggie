import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { IssueCard } from "@/components/issue-card";
import { useReady } from "@/queries";

export const Route = createFileRoute("/ready")({
  component: Ready,
});

function Ready() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useReady();

  const select = (id: string) => navigate({ to: ".", search: (s) => ({ ...s, issue: id }) });

  if (isLoading) {
    return <p className="text-muted">loading…</p>;
  }
  if (error) {
    return <p className="text-accent">error: {error.message}</p>;
  }

  return (
    <div className="max-w-2xl">
      <h2 className="mb-2 text-muted text-xs uppercase tracking-widest">
        ready ({data?.length ?? 0})
      </h2>
      {data?.map((issue) => (
        <IssueCard key={issue.id} issue={issue} onSelect={select} />
      ))}
    </div>
  );
}
