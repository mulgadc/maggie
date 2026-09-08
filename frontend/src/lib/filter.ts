import type { Issue, Status } from "@/api"

export const ALL_STATUSES: Status[] = [
  "open",
  "in_progress",
  "blocked",
  "deferred",
  "closed",
]

// An "all" value for priority, type, assignee or label means "no filter".
export interface Filters {
  // matches id or title (substring, case-insensitive)
  text: string
  // glob on id, e.g. "mulga-siv-*"
  idGlob: string
  // included statuses; full set = no filter
  statuses: Status[]
  priority: number | "all"
  type: string
  assignee: string
  // issue must carry this label
  label: string
}

const STATUS_SET = new Set<string>(ALL_STATUSES)

export const EMPTY_FILTERS: Filters = {
  text: "",
  idGlob: "",
  statuses: [...ALL_STATUSES],
  priority: "all",
  type: "all",
  assignee: "all",
  label: "all",
}

// GroupMode controls how the table nests rows: by epic hierarchy, by label, or
// flat.
export type GroupMode = "none" | "epic" | "label"

export type SortKey =
  | "id"
  | "title"
  | "status"
  | "priority"
  | "issue_type"
  | "assignee"
  | "updated_at"
  | "created_at"

export interface Sort {
  key: SortKey
  dir: "asc" | "desc"
}

// globToRegExp turns a shell-style glob (only `*` wildcard) into an anchored,
// case-insensitive RegExp. Other regex metacharacters are escaped.
export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replaceAll(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
  return new RegExp(`^${escaped}$`, "i")
}

export function applyFilters(issues: Issue[], f: Filters): Issue[] {
  const text = f.text.trim().toLowerCase()
  const glob = f.idGlob.trim()
  const re = glob ? globToRegExp(glob) : null
  return issues.filter((i) => {
    if (
      text &&
      !(
        i.id.toLowerCase().includes(text) ||
        i.title.toLowerCase().includes(text)
      )
    ) {
      return false
    }
    if (re && !re.test(i.id)) {
      return false
    }
    if (!f.statuses.includes(i.status)) {
      return false
    }
    if (f.priority !== "all" && i.priority !== f.priority) {
      return false
    }
    if (f.type !== "all" && i.issue_type !== f.type) {
      return false
    }
    if (f.assignee !== "all" && (i.assignee ?? "") !== f.assignee) {
      return false
    }
    if (f.label !== "all" && !(i.labels ?? []).includes(f.label)) {
      return false
    }
    return true
  })
}

function cmp(a: Issue, b: Issue, key: SortKey): number {
  if (key === "priority") {
    return a.priority - b.priority
  }
  const av = a[key] ?? ""
  const bv = b[key] ?? ""
  return av.localeCompare(bv)
}

export function sortIssues(issues: Issue[], s: Sort): Issue[] {
  const sorted = issues.toSorted((a, b) => cmp(a, b, s.key))
  return s.dir === "asc" ? sorted : sorted.toReversed()
}

export const DEFAULT_SORT: Sort = { key: "priority", dir: "asc" }

const SORT_KEYS = new Set<SortKey>([
  "id",
  "title",
  "status",
  "priority",
  "issue_type",
  "assignee",
  "updated_at",
  "created_at",
])

// TableSearch is the URL query-string shape (compact keys), all optional so a
// bare URL means "defaults".
export interface TableSearch {
  q?: string
  idg?: string
  // comma-separated statuses; absent = all
  st?: string
  pri?: number
  type?: string
  asgn?: string
  // filter to a single label
  lbl?: string
  sort?: SortKey
  dir?: "asc" | "desc"
  // group table rows by epic or label
  group?: GroupMode
}

export function paramsToFilters(s: TableSearch): Filters {
  const sts = s.st
    ? s.st.split(",").filter((v): v is Status => STATUS_SET.has(v))
    : [...ALL_STATUSES]
  return {
    text: s.q ?? "",
    idGlob: s.idg ?? "",
    statuses: sts.length ? sts : [...ALL_STATUSES],
    priority: s.pri ?? "all",
    type: s.type ?? "all",
    assignee: s.asgn ?? "all",
    label: s.lbl ?? "all",
  }
}

export function paramsToSort(s: TableSearch): Sort {
  return {
    key: s.sort && SORT_KEYS.has(s.sort) ? s.sort : DEFAULT_SORT.key,
    dir: s.dir === "desc" ? "desc" : "asc",
  }
}

// filtersToParams / sortToParams emit only non-default values so shared URLs
// stay short. Defaults map to undefined, which removes the key on navigate.
export function filtersToParams(f: Filters): TableSearch {
  return {
    q: f.text || undefined,
    idg: f.idGlob || undefined,
    st:
      f.statuses.length === ALL_STATUSES.length
        ? undefined
        : f.statuses.join(","),
    pri: f.priority === "all" ? undefined : f.priority,
    type: f.type === "all" ? undefined : f.type,
    asgn: f.assignee === "all" ? undefined : f.assignee,
    lbl: f.label === "all" ? undefined : f.label,
  }
}

export function sortToParams(s: Sort): TableSearch {
  const isDefault = s.key === DEFAULT_SORT.key && s.dir === DEFAULT_SORT.dir
  return {
    sort: isDefault ? undefined : s.key,
    dir: isDefault ? undefined : s.dir,
  }
}

export function uniqueSorted(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].toSorted((a, b) =>
    a.localeCompare(b),
  )
}

// rootId returns the top-level ancestor id by stripping the dotted child suffix
// (beads name children hierarchically, e.g. mulga-siv-231.7.4 -> mulga-siv-231).
export function rootId(id: string): string {
  const dot = id.indexOf(".")
  return dot === -1 ? id : id.slice(0, dot)
}

// idPrefix returns the bead's project/area prefix by dropping the numeric tail
// off the root id (mulga-siv-477 -> mulga-siv, mulga-7g1 -> mulga).
export function idPrefix(id: string): string {
  const root = rootId(id)
  const dash = root.lastIndexOf("-")
  return dash === -1 ? root : root.slice(0, dash)
}

// allPrefixes lists every distinct id prefix, sorted.
export function allPrefixes(issues: Issue[]): string[] {
  return uniqueSorted(issues.map((i) => idPrefix(i.id)))
}

export type GroupNode =
  | { kind: "epic"; issue: Issue; children: Issue[] }
  | { kind: "loose"; issue: Issue }

// buildGroups nests dotted children under their root bead, preserving the
// incoming (already sorted/filtered) order for both parents and children.
export function buildGroups(rows: Issue[]): GroupNode[] {
  const byId = new Map(rows.map((i) => [i.id, i]))
  const childrenOf = new Map<string, Issue[]>()
  const children = new Set<string>()
  for (const i of rows) {
    const root = rootId(i.id)
    if (root !== i.id && byId.has(root)) {
      children.add(i.id)
      const list = childrenOf.get(root) ?? []
      list.push(i)
      childrenOf.set(root, list)
    }
  }
  const nodes: GroupNode[] = []
  for (const i of rows) {
    if (children.has(i.id)) {
      continue
    }
    const kids = childrenOf.get(i.id)
    nodes.push(
      kids?.length
        ? { kind: "epic", issue: i, children: kids }
        : { kind: "loose", issue: i },
    )
  }
  return nodes
}

export interface LabelGroup {
  // "" denotes the unlabeled bucket
  label: string
  issues: Issue[]
}

// allLabels returns every distinct label across the issues, sorted.
export function allLabels(issues: Issue[]): string[] {
  return uniqueSorted(issues.flatMap((i) => i.labels ?? []))
}

// buildLabelGroups buckets issues by label (alphabetical), with the unlabeled
// bucket last. An issue with several labels appears under each of them.
export function buildLabelGroups(rows: Issue[]): LabelGroup[] {
  const byLabel = new Map<string, Issue[]>()
  const unlabeled: Issue[] = []
  for (const i of rows) {
    const labels = i.labels ?? []
    if (!labels.length) {
      unlabeled.push(i)
      continue
    }
    for (const l of labels) {
      const list = byLabel.get(l) ?? []
      list.push(i)
      byLabel.set(l, list)
    }
  }
  const groups: LabelGroup[] = [...byLabel.keys()]
    .toSorted((a, b) => a.localeCompare(b))
    .map((label) => ({ label, issues: byLabel.get(label) ?? [] }))
  if (unlabeled.length) {
    groups.push({ label: "", issues: unlabeled })
  }
  return groups
}
