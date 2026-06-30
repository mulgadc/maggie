import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import type { Issue } from "@/api";
import { PriorityBadge, StatusBadge, TypeBadge } from "@/components/badges";
import type { GroupNode, Sort, SortKey } from "@/lib/filter";

function fmtDate(ts?: string) {
  if (!ts) {
    return "—";
  }
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toISOString().slice(0, 10);
}

const COLS: { key: SortKey; label: string; className?: string }[] = [
  { key: "priority", label: "Pri", className: "w-14" },
  { key: "id", label: "ID", className: "w-36" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status", className: "w-28" },
  { key: "issue_type", label: "Type", className: "w-24" },
  { key: "assignee", label: "Assignee", className: "w-36" },
  { key: "updated_at", label: "Updated", className: "w-24" },
];

function Cells({ i, indent, rail }: { i: Issue; indent?: boolean; rail?: boolean }) {
  return (
    <>
      <td className={`px-3 py-2 ${rail ? "border-accent/40 border-l-2" : ""}`}>
        <PriorityBadge priority={i.priority} />
      </td>
      <td
        className={`truncate px-3 py-2 font-mono text-accent text-xs ${indent ? "pl-8" : ""}`}
        title={i.id}
      >
        {indent ? <span className="mr-1 text-muted">└</span> : null}
        {i.id}
      </td>
      <td className="truncate px-3 py-2" title={i.title}>
        {i.title}
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={i.status} />
      </td>
      <td className="truncate px-3 py-2">
        <TypeBadge type={i.issue_type} />
      </td>
      <td className="truncate px-3 py-2 text-muted" title={i.assignee ?? ""}>
        {i.assignee ?? "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-muted">{fmtDate(i.updated_at)}</td>
    </>
  );
}

export function IssueTable({
  rows,
  groups,
  sort,
  onSortChange,
  onSelect,
}: {
  rows: Issue[];
  groups?: GroupNode[];
  sort: Sort;
  onSortChange: (s: Sort) => void;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleSort = (key: SortKey) =>
    onSortChange({ key, dir: sort.key === key && sort.dir === "asc" ? "desc" : "asc" });
  const toggleEpic = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="overflow-x-hidden rounded-lg border border-line">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className="sticky top-0 bg-panel">
          <tr>
            {COLS.map((c) => (
              <th
                key={c.key}
                className={`whitespace-nowrap border-line border-b px-3 py-2 text-left font-medium text-muted ${c.className ?? ""}`}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(c.key)}
                  className="inline-flex items-center gap-1 hover:text-text"
                >
                  {c.label}
                  {sort.key === c.key ? (
                    sort.dir === "asc" ? (
                      <ArrowUp size={12} />
                    ) : (
                      <ArrowDown size={12} />
                    )
                  ) : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups
            ? groups.map((g) =>
                g.kind === "loose" ? (
                  <tr
                    key={g.issue.id}
                    onClick={() => onSelect(g.issue.id)}
                    className="cursor-pointer border-line border-b last:border-0 hover:bg-surface2/50"
                  >
                    <Cells i={g.issue} />
                  </tr>
                ) : (
                  <EpicGroup
                    key={g.issue.id}
                    epic={g.issue}
                    kids={g.children}
                    expanded={open.has(g.issue.id)}
                    onToggle={() => toggleEpic(g.issue.id)}
                    onSelect={onSelect}
                  />
                ),
              )
            : rows.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => onSelect(i.id)}
                  className="cursor-pointer border-line border-b last:border-0 hover:bg-surface2/50"
                >
                  <Cells i={i} />
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

function EpicGroup({
  epic,
  kids,
  expanded,
  onToggle,
  onSelect,
}: {
  epic: Issue;
  kids: Issue[];
  expanded: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-line border-b bg-accent/10 hover:bg-accent/15"
      >
        <td className="border-accent border-l-2 px-3 py-2">
          <PriorityBadge priority={epic.priority} />
        </td>
        <td className="truncate px-3 py-2 font-mono text-accent text-xs" title={epic.id}>
          <span className="inline-flex items-center gap-1 font-semibold">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {epic.id}
          </span>
        </td>
        <td className="truncate px-3 py-2 font-semibold">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(epic.id);
            }}
            className="hover:text-accent"
          >
            {epic.title}
          </button>
          <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 font-normal text-accent text-xs">
            {kids.length} {kids.length === 1 ? "child" : "children"}
          </span>
        </td>
        <td className="px-3 py-2">
          <StatusBadge status={epic.status} />
        </td>
        <td className="truncate px-3 py-2">
          <TypeBadge type={epic.issue_type} />
        </td>
        <td className="truncate px-3 py-2 text-muted" title={epic.assignee ?? ""}>
          {epic.assignee ?? "—"}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-muted">{fmtDate(epic.updated_at)}</td>
      </tr>
      {expanded
        ? kids.map((c, idx) => (
            <tr
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`cursor-pointer bg-surface2/20 hover:bg-surface2/50 ${
                idx === kids.length - 1 ? "border-accent/40 border-b-2" : "border-line border-b"
              }`}
            >
              <Cells i={c} indent rail />
            </tr>
          ))
        : null}
    </>
  );
}
