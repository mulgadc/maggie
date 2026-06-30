import { X } from "lucide-react";

import { useIssue } from "@/queries";

export function IssueDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: issue, isLoading, error } = useIssue(id);
  const open = id !== "";

  return (
    <aside
      className={`fixed inset-y-0 right-0 z-20 w-[min(560px,100%)] overflow-auto border-line border-l bg-panel p-5 transition-transform ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <button
        type="button"
        onClick={onClose}
        className="float-right text-muted hover:text-text"
        aria-label="Close"
      >
        <X size={18} />
      </button>
      {isLoading ? <p>loading…</p> : null}
      {error ? <p className="text-accent">error: {error.message}</p> : null}
      {issue ? (
        <>
          <h2 className="font-mono text-amber">{issue.id}</h2>
          <h3 className="mt-1 font-semibold text-lg">{issue.title}</h3>
          <div className="mt-1 text-muted text-xs">
            {issue.status} · P{issue.priority} · {issue.issue_type}
            {issue.assignee ? ` · ${issue.assignee}` : ""}
          </div>
          <pre className="mt-4 whitespace-pre-wrap break-words rounded-lg border border-line bg-bg p-3 text-sm">
            {issue.description || "(no description)"}
          </pre>
        </>
      ) : null}
    </aside>
  );
}
