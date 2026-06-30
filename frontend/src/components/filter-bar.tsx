import { X } from "lucide-react";
import { useMemo } from "react";

import type { Status } from "@/api";
import { StatusDot } from "@/components/badges";
import {
  ALL_STATUSES,
  applyFilters,
  EMPTY_FILTERS,
  type Filters,
  uniqueSorted,
} from "@/lib/filter";
import { useIssues } from "@/queries";

const FIELD =
  "rounded-md border border-line bg-bg px-2 py-1 text-sm text-text focus:border-accent focus:outline-none";

function StatusChips({
  active,
  onChange,
}: {
  active: Status[];
  onChange: (next: Status[]) => void;
}) {
  const toggle = (s: Status) =>
    onChange(active.includes(s) ? active.filter((x) => x !== s) : [...active, s]);
  return (
    <div className="flex items-center gap-1">
      {ALL_STATUSES.map((s) => {
        const on = active.includes(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${
              on ? "border-line text-text" : "border-transparent text-muted line-through opacity-50"
            }`}
            title={on ? `hide ${s}` : `show ${s}`}
          >
            <StatusDot status={s} />
            {s.replace("_", " ")}
          </button>
        );
      })}
    </div>
  );
}

export function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const { data: issues } = useIssues();
  const all = issues ?? [];
  const types = useMemo(() => uniqueSorted(all.map((i) => i.issue_type)), [all]);
  const assignees = useMemo(() => uniqueSorted(all.map((i) => i.assignee)), [all]);
  const matched = useMemo(() => applyFilters(all, filters).length, [all, filters]);

  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const dirty = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div className="flex flex-col gap-2 border-line border-b bg-bg px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${FIELD} w-64`}
          placeholder="search… (use * for id glob, e.g. mulga-siv-*)"
          value={filters.idGlob || filters.text}
          onChange={(e) => {
            const v = e.target.value;
            // `*` switches the box into id-glob mode; otherwise free substring.
            set(v.includes("*") ? { idGlob: v, text: "" } : { text: v, idGlob: "" });
          }}
        />
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
            onClick={() => onChange(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-muted text-sm hover:text-text"
          >
            <X size={14} /> clear
          </button>
        ) : null}
        <span className="ml-auto text-muted text-sm">
          {matched} of {all.length}
        </span>
      </div>
      <StatusChips active={filters.statuses} onChange={(statuses) => set({ statuses })} />
    </div>
  );
}
