import { ArrowDown, ArrowUp } from "lucide-react";

import type { Issue } from "@/api";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import type { Sort, SortKey } from "@/lib/filter";

function fmtDate(ts?: string) {
  if (!ts) {
    return "—";
  }
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toISOString().slice(0, 10);
}

const COLS: { key: SortKey; label: string; className?: string }[] = [
  { key: "priority", label: "Pri" },
  { key: "id", label: "ID" },
  { key: "title", label: "Title", className: "w-full" },
  { key: "status", label: "Status" },
  { key: "issue_type", label: "Type" },
  { key: "assignee", label: "Assignee" },
  { key: "updated_at", label: "Updated" },
];

export function IssueTable({
  rows,
  sort,
  onSortChange,
  onSelect,
}: {
  rows: Issue[];
  sort: Sort;
  onSortChange: (s: Sort) => void;
  onSelect: (id: string) => void;
}) {
  const toggleSort = (key: SortKey) =>
    onSortChange({ key, dir: sort.key === key && sort.dir === "asc" ? "desc" : "asc" });

  return (
    <div className="overflow-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-sm">
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
          {rows.map((i) => (
            <tr
              key={i.id}
              onClick={() => onSelect(i.id)}
              className="cursor-pointer border-line border-b last:border-0 hover:bg-surface2/50"
            >
              <td className="px-3 py-2">
                <PriorityBadge priority={i.priority} />
              </td>
              <td className="whitespace-nowrap px-3 py-2 font-mono text-accent text-xs">{i.id}</td>
              <td className="max-w-md truncate px-3 py-2">{i.title}</td>
              <td className="px-3 py-2">
                <StatusBadge status={i.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-muted">{i.issue_type}</td>
              <td className="whitespace-nowrap px-3 py-2 text-muted">{i.assignee ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 text-muted">{fmtDate(i.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
