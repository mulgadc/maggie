import { X } from "lucide-react";

import type { Comment, DepRef, Issue } from "@/api";
import { LabelChip, PriorityBadge, StatusBadge, StatusDot, TypeBadge } from "@/components/badges";
import { useIssue } from "@/queries";

function fmt(ts?: string) {
  if (!ts) {
    return "—";
  }
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toISOString().slice(0, 16).replace("T", " ");
}

function Meta({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }
  return (
    <div>
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="truncate text-sm">{value}</dd>
    </div>
  );
}

function Section({ title, body }: { title: string; body?: string }) {
  if (!body?.trim()) {
    return null;
  }
  return (
    <section className="mt-5">
      <h4 className="mb-1.5 font-semibold text-muted text-xs uppercase tracking-wider">{title}</h4>
      <p className="whitespace-pre-wrap break-words text-sm text-text/90 leading-relaxed">{body}</p>
    </section>
  );
}

function DepList({
  title,
  items,
  onSelect,
}: {
  title: string;
  items?: DepRef[];
  onSelect: (id: string) => void;
}) {
  if (!items?.length) {
    return null;
  }
  const openItems = items.filter((d) => d.status !== "closed");
  const hiddenClosed = items.length - openItems.length;
  if (!openItems.length) {
    return null;
  }
  return (
    <section className="mt-5">
      <h4 className="mb-1.5 font-semibold text-muted text-xs uppercase tracking-wider">
        {title} ({openItems.length})
        {hiddenClosed ? (
          <span className="ml-2 font-normal lowercase tracking-normal">
            +{hiddenClosed} closed hidden
          </span>
        ) : null}
      </h4>
      <ul className="flex flex-col gap-1">
        {openItems.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onSelect(d.id)}
              className="flex w-full items-center gap-2 rounded-md border border-line bg-bg px-2 py-1.5 text-left hover:border-accent"
            >
              <StatusDot status={d.status} />
              <span className="font-mono text-accent text-xs">{d.id}</span>
              <span className="truncate text-sm">{d.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function byType(arr: DepRef[] | undefined, t: string): DepRef[] {
  return (arr ?? []).filter((d) => (d.dependency_type ?? "blocks") === t);
}

// dedupe relates-to: it is symmetric so the same ref shows in both arrays.
function dedupe(items: DepRef[]): DepRef[] {
  const seen = new Set<string>();
  return items.filter((d) => (seen.has(d.id) ? false : seen.add(d.id)));
}

// Relations carries the issue's links split by semantic dependency_type, so
// parent/child (epic structure) is distinct from hard blocks and relates-to.
function Relations({ issue, onSelect }: { issue: Issue; onSelect: (id: string) => void }) {
  const deps = issue.dependencies;
  const dents = issue.dependents;
  const related = dedupe([...byType(deps, "relates-to"), ...byType(dents, "relates-to")]);
  return (
    <>
      <DepList title="Parent" items={byType(deps, "parent-child")} onSelect={onSelect} />
      <DepList title="Children" items={byType(dents, "parent-child")} onSelect={onSelect} />
      <DepList title="Blocked by" items={byType(deps, "blocks")} onSelect={onSelect} />
      <DepList title="Blocks" items={byType(dents, "blocks")} onSelect={onSelect} />
      <DepList title="Related" items={related} onSelect={onSelect} />
      <DepList title="Tracks" items={byType(deps, "tracks")} onSelect={onSelect} />
      <DepList title="Tracked by" items={byType(dents, "tracks")} onSelect={onSelect} />
    </>
  );
}

function Comments({ items }: { items?: Comment[] }) {
  if (!items?.length) {
    return null;
  }
  return (
    <section className="mt-5">
      <h4 className="mb-1.5 font-semibold text-muted text-xs uppercase tracking-wider">
        Comments ({items.length})
      </h4>
      <ul className="flex flex-col gap-2">
        {items.map((c) => (
          <li key={c.id} className="rounded-md border border-line bg-bg px-3 py-2">
            <div className="mb-1 flex items-center gap-2 text-muted text-xs">
              <span className="font-medium text-text/80">{c.author ?? "unknown"}</span>
              <span>{fmt(c.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-text/90 leading-relaxed">
              {c.text}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function IssueDetail({
  id,
  onSelect,
  onClose,
}: {
  id: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { data: issue, isLoading, error } = useIssue(id);
  const open = id !== "";

  return (
    <aside
      className={`fixed inset-y-0 right-0 z-20 flex w-[min(620px,100%)] flex-col border-line border-l bg-panel shadow-2xl transition-transform ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-start gap-3 border-line border-b p-5">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-accent text-xs">{issue?.id ?? id}</div>
          <h3 className="mt-1 font-semibold text-lg leading-snug">
            {issue?.title ?? (isLoading ? "loading…" : "")}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted hover:bg-surface2 hover:text-text"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {error ? <p className="text-st-blocked">error: {error.message}</p> : null}
        {issue ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={issue.status} />
              <PriorityBadge priority={issue.priority} />
              <TypeBadge type={issue.issue_type} />
            </div>
            {issue.labels?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {issue.labels.map((l) => (
                  <LabelChip key={l} label={l} />
                ))}
              </div>
            ) : null}

            <dl className="mt-4 grid grid-cols-2 gap-3">
              <Meta label="Assignee" value={issue.assignee} />
              <Meta label="Owner" value={issue.created_by ?? issue.owner} />
              <Meta label="Created" value={fmt(issue.created_at)} />
              <Meta label="Updated" value={fmt(issue.updated_at)} />
              {issue.closed_at ? <Meta label="Closed" value={fmt(issue.closed_at)} /> : null}
            </dl>

            <Section title="Description" body={issue.description} />
            <Section title="Acceptance Criteria" body={issue.acceptance_criteria} />
            <Section title="Notes" body={issue.notes} />
            {issue.status === "closed" && issue.close_reason ? (
              <Section title="Close Reason" body={issue.close_reason} />
            ) : null}

            <Relations issue={issue} onSelect={onSelect} />
            <Comments items={issue.comments} />
          </>
        ) : null}
      </div>
    </aside>
  );
}

export type { Issue };
