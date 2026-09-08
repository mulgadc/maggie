import { GitMerge, MessageSquare } from "lucide-react"

import type { Issue, Status } from "@/api"
import { LabelChip, PriorityBadge, StatusBadge } from "@/components/badges"
import { cn } from "@/lib/utils"

const STATUS_BORDER = {
  open: "border-l-st-open",
  in_progress: "border-l-st-in_progress",
  blocked: "border-l-st-blocked",
  deferred: "border-l-st-deferred",
  closed: "border-l-st-closed",
} satisfies Record<Status, string>

export function IssueCard({
  issue,
  onSelect,
}: {
  issue: Issue
  onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onSelect(issue.id)
      }}
      className={cn(
        "mb-2.5 w-full rounded-lg border border-l-[3px] border-line bg-panel p-3 text-left",
        "transition-colors hover:border-accent",
        STATUS_BORDER[issue.status],
      )}
    >
      <div className="font-mono text-xs text-accent">{issue.id}</div>
      <div className="mt-1 text-sm leading-snug">{issue.title}</div>
      {issue.labels?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {issue.labels.map((l) => (
            <LabelChip key={l} label={l} />
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={issue.priority} />
        <StatusBadge status={issue.status} />
        {issue.assignee ? (
          <span className="text-xs text-muted">{issue.assignee}</span>
        ) : null}
        {issue.dependency_count ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <GitMerge size={12} />
            {issue.dependency_count}
          </span>
        ) : null}
        {issue.comment_count ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <MessageSquare size={12} />
            {issue.comment_count}
          </span>
        ) : null}
      </div>
    </button>
  )
}
