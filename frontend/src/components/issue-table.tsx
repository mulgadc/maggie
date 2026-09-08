import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react"
import { type ReactNode, useState } from "react"

import type { Issue } from "@/api"
import {
  LabelChip,
  PriorityBadge,
  StatusBadge,
  TypeBadge,
} from "@/components/badges"
import type { GroupNode, LabelGroup, Sort, SortKey } from "@/lib/filter"

function TitleCell({ i }: { i: Issue }) {
  const labels = i.labels ?? []
  return (
    <td className="px-3 py-2" title={i.title}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate">{i.title}</span>
        {labels.slice(0, 3).map((l) => (
          <LabelChip key={l} label={l} />
        ))}
        {labels.length > 3 ? (
          <span className="shrink-0 text-xs text-muted">
            +{labels.length - 3}
          </span>
        ) : null}
      </div>
    </td>
  )
}

function fmtDate(ts?: string) {
  if (!ts) {
    return "—"
  }
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toISOString().slice(0, 10)
}

const COLS: { key: SortKey; label: string; className?: string }[] = [
  { key: "priority", label: "Pri", className: "w-14" },
  { key: "id", label: "ID", className: "w-36" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status", className: "w-28" },
  { key: "issue_type", label: "Type", className: "w-24" },
  { key: "assignee", label: "Assignee", className: "w-36" },
  { key: "updated_at", label: "Updated", className: "w-28 pr-5" },
]

function Cells({
  i,
  indent,
  rail,
}: {
  i: Issue
  indent?: boolean
  rail?: boolean
}) {
  return (
    <>
      <td className={`px-3 py-2 ${rail ? "border-l-2 border-accent/40" : ""}`}>
        <PriorityBadge priority={i.priority} />
      </td>
      <td
        className={`truncate px-3 py-2 font-mono text-xs text-accent ${indent ? "pl-8" : ""}`}
        title={i.id}
      >
        {indent ? <span className="mr-1 text-muted">└</span> : null}
        {i.id}
      </td>
      <TitleCell i={i} />
      <td className="px-3 py-2">
        <StatusBadge status={i.status} />
      </td>
      <td className="truncate px-3 py-2">
        <TypeBadge type={i.issue_type} />
      </td>
      <td className="truncate px-3 py-2 text-muted" title={i.assignee ?? ""}>
        {i.assignee ?? "—"}
      </td>
      <td className="py-2 pr-5 pl-3 whitespace-nowrap text-muted">
        {fmtDate(i.updated_at)}
      </td>
    </>
  )
}

export function IssueTable({
  rows,
  groups,
  labelGroups,
  sort,
  onSortChange,
  onSelect,
}: {
  rows: Issue[]
  groups?: GroupNode[]
  labelGroups?: LabelGroup[]
  sort: Sort
  onSortChange: (s: Sort) => void
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggleSort = (key: SortKey) => {
    onSortChange({
      key,
      dir: sort.key === key && sort.dir === "asc" ? "desc" : "asc",
    })
  }
  const toggleEpic = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  let body: ReactNode
  if (labelGroups) {
    body = labelGroups.map((g) => (
      <LabelSection
        key={g.label || "__unlabeled"}
        group={g}
        expanded={open.has(`lbl:${g.label}`)}
        onToggle={() => {
          toggleEpic(`lbl:${g.label}`)
        }}
        onSelect={onSelect}
      />
    ))
  } else if (groups) {
    body = groups.map((g) =>
      g.kind === "loose" ? (
        <tr
          key={g.issue.id}
          onClick={() => {
            onSelect(g.issue.id)
          }}
          className="cursor-pointer border-b border-line last:border-0 hover:bg-surface2/50"
        >
          <Cells i={g.issue} />
        </tr>
      ) : (
        <EpicGroup
          key={g.issue.id}
          epic={g.issue}
          kids={g.children}
          expanded={open.has(g.issue.id)}
          onToggle={() => {
            toggleEpic(g.issue.id)
          }}
          onSelect={onSelect}
        />
      ),
    )
  } else {
    body = rows.map((i) => (
      <tr
        key={i.id}
        onClick={() => {
          onSelect(i.id)
        }}
        className="cursor-pointer border-b border-line last:border-0 hover:bg-surface2/50"
      >
        <Cells i={i} />
      </tr>
    ))
  }

  return (
    <div className="overflow-x-hidden rounded-lg border border-line">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className="sticky top-0 bg-panel">
          <tr>
            {COLS.map((c) => (
              <th
                key={c.key}
                className={`border-b border-line px-3 py-2 text-left font-medium whitespace-nowrap text-muted ${c.className ?? ""}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    toggleSort(c.key)
                  }}
                  className="inline-flex items-center gap-1 hover:text-text"
                >
                  {c.label}
                  {sort.key === c.key ? <SortArrow dir={sort.dir} /> : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  )
}

function SortArrow({ dir }: { dir: "asc" | "desc" }) {
  return dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
}

function EpicGroup({
  epic,
  kids,
  expanded,
  onToggle,
  onSelect,
}: {
  epic: Issue
  kids: Issue[]
  expanded: boolean
  onToggle: () => void
  onSelect: (id: string) => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-line bg-accent/10 hover:bg-accent/15"
      >
        <td className="border-l-2 border-accent px-3 py-2">
          <PriorityBadge priority={epic.priority} />
        </td>
        <td
          className="truncate px-3 py-2 font-mono text-xs text-accent"
          title={epic.id}
        >
          <span className="inline-flex items-center gap-1 font-semibold">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {epic.id}
          </span>
        </td>
        <td className="truncate px-3 py-2 font-semibold">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(epic.id)
            }}
            className="hover:text-accent"
          >
            {epic.title}
          </button>
          <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-normal text-accent">
            {kids.length} {kids.length === 1 ? "child" : "children"}
          </span>
        </td>
        <td className="px-3 py-2">
          <StatusBadge status={epic.status} />
        </td>
        <td className="truncate px-3 py-2">
          <TypeBadge type={epic.issue_type} />
        </td>
        <td
          className="truncate px-3 py-2 text-muted"
          title={epic.assignee ?? ""}
        >
          {epic.assignee ?? "—"}
        </td>
        <td className="py-2 pr-5 pl-3 whitespace-nowrap text-muted">
          {fmtDate(epic.updated_at)}
        </td>
      </tr>
      {expanded
        ? kids.map((c, idx) => (
            <tr
              key={c.id}
              onClick={() => {
                onSelect(c.id)
              }}
              className={`cursor-pointer bg-surface2/20 hover:bg-surface2/50 ${
                idx === kids.length - 1
                  ? "border-b-2 border-accent/40"
                  : "border-b border-line"
              }`}
            >
              <Cells i={c} indent rail />
            </tr>
          ))
        : null}
    </>
  )
}

function LabelSection({
  group,
  expanded,
  onToggle,
  onSelect,
}: {
  group: LabelGroup
  expanded: boolean
  onToggle: () => void
  onSelect: (id: string) => void
}) {
  const { label, issues } = group
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-line bg-surface2/40 hover:bg-surface2/60"
      >
        <td colSpan={7} className="px-3 py-2">
          <span className="inline-flex items-center gap-2 font-semibold">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {label ? (
              <LabelChip label={label} />
            ) : (
              <span className="text-muted italic">unlabeled</span>
            )}
            <span className="text-xs font-normal text-muted">
              {issues.length}
            </span>
          </span>
        </td>
      </tr>
      {expanded
        ? issues.map((c, idx) => (
            <tr
              key={c.id}
              onClick={() => {
                onSelect(c.id)
              }}
              className={`cursor-pointer bg-surface2/10 hover:bg-surface2/50 ${
                idx === issues.length - 1
                  ? "border-b-2 border-accent/40"
                  : "border-b border-line"
              }`}
            >
              <Cells i={c} indent rail />
            </tr>
          ))
        : null}
    </>
  )
}
