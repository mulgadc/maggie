import { Link as LinkIcon, MessageSquare } from "lucide-react";

import type { Issue, Status } from "@/api";
import { cn } from "@/lib/utils";

const STATUS_BORDER: Record<Status, string> = {
  open: "border-l-st-open",
  in_progress: "border-l-st-in_progress",
  blocked: "border-l-st-blocked",
  deferred: "border-l-st-deferred",
  closed: "border-l-st-closed",
};

export function IssueCard({ issue, onSelect }: { issue: Issue; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(issue.id)}
      className={cn(
        "mb-2.5 w-full rounded-lg border border-line border-l-[3px] bg-panel p-3 text-left",
        "transition-colors hover:border-amber",
        STATUS_BORDER[issue.status],
      )}
    >
      <div className="font-mono text-amber text-xs">{issue.id}</div>
      <div className="mt-1 text-sm">{issue.title}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-muted text-xs">
        <span className="rounded bg-line px-1.5 py-0.5">P{issue.priority}</span>
        <span className="rounded bg-line px-1.5 py-0.5">{issue.issue_type}</span>
        {issue.assignee ? <span>{issue.assignee}</span> : null}
        {issue.dependency_count ? (
          <span className="inline-flex items-center gap-1">
            <LinkIcon size={12} />
            {issue.dependency_count}
          </span>
        ) : null}
        {issue.comment_count ? (
          <span className="inline-flex items-center gap-1">
            <MessageSquare size={12} />
            {issue.comment_count}
          </span>
        ) : null}
      </div>
    </button>
  );
}
