import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { Issue, Status } from "@/api";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import {
  applyFilters,
  EMPTY_FILTERS,
  type Filters,
  type Sort,
  type SortKey,
  sortIssues,
  uniqueSorted,
} from "@/lib/filter";

const STATUSES: Status[] = ["open", "in_progress", "blocked", "deferred", "closed"];
const FIELD =
  "rounded-md border border-line bg-bg px-2 py-1 text-sm text-text focus:border-accent focus:outline-none";

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
  issues,
  onSelect,
}: {
  issues: Issue[];
  onSelect: (id: string) => void;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<Sort>({ key: "priority", dir: "asc" });

  const types = useMemo(() => uniqueSorted(issues.map((i) => i.issue_type)), [issues]);
  const assignees = useMemo(() => uniqueSorted(issues.map((i) => i.assignee)), [issues]);

  const rows = useMemo(
    () => sortIssues(applyFilters(issues, filters), sort),
    [issues, filters, sort],
  );

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  const dirty = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={FIELD}
          placeholder="search id or title…"
          value={filters.text}
          onChange={(e) => set({ text: e.target.value })}
        />
        <input
          className={`${FIELD} font-mono`}
          placeholder="id glob e.g. mulga-siv-*"
          value={filters.idGlob}
          onChange={(e) => set({ idGlob: e.target.value })}
        />
        <select
          className={FIELD}
          value={filters.status}
          onChange={(e) => set({ status: e.target.value as Filters["status"] })}
        >
          <option value="all">status: all</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className={FIELD}
          value={String(filters.priority)}
          onChange={(e) =>
            set({ priority: e.target.value === "all" ? "all" : Number(e.target.value) })
          }
        >
          <option value="all">priority: all</option>
          {[0, 1, 2, 3, 4].map((p) => (
            <option key={p} value={p}>
              P{p}
            </option>
          ))}
        </select>
        <select
          className={FIELD}
          value={filters.type}
          onChange={(e) => set({ type: e.target.value })}
        >
          <option value="all">type: all</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className={`${FIELD} max-w-48`}
          value={filters.assignee}
          onChange={(e) => set({ assignee: e.target.value })}
        >
          <option value="all">assignee: all</option>
          {assignees.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {dirty ? (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-muted text-sm hover:text-text"
          >
            <X size={14} /> clear
          </button>
        ) : null}
        <span className="ml-auto text-muted text-sm">
          {rows.length} of {issues.length}
        </span>
      </div>

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
                <td className="whitespace-nowrap px-3 py-2 font-mono text-accent text-xs">
                  {i.id}
                </td>
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
    </div>
  );
}
