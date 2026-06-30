import type { Issue, Status } from "@/api";

export const ALL_STATUSES: Status[] = ["open", "in_progress", "blocked", "deferred", "closed"];

export interface Filters {
  text: string; // matches id or title (substring, case-insensitive)
  idGlob: string; // glob on id, e.g. "mulga-siv-*"
  statuses: Status[]; // included statuses; full set = no filter
  priority: number | "all";
  type: string | "all";
  assignee: string | "all";
}

export const EMPTY_FILTERS: Filters = {
  text: "",
  idGlob: "",
  statuses: [...ALL_STATUSES],
  priority: "all",
  type: "all",
  assignee: "all",
};

export type SortKey =
  | "id"
  | "title"
  | "status"
  | "priority"
  | "issue_type"
  | "assignee"
  | "updated_at"
  | "created_at";

export interface Sort {
  key: SortKey;
  dir: "asc" | "desc";
}

// globToRegExp turns a shell-style glob (only `*` wildcard) into an anchored,
// case-insensitive RegExp. Other regex metacharacters are escaped.
export function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

export function applyFilters(issues: Issue[], f: Filters): Issue[] {
  const text = f.text.trim().toLowerCase();
  const glob = f.idGlob.trim();
  const re = glob ? globToRegExp(glob) : null;
  return issues.filter((i) => {
    if (text && !(i.id.toLowerCase().includes(text) || i.title.toLowerCase().includes(text))) {
      return false;
    }
    if (re && !re.test(i.id)) {
      return false;
    }
    if (!f.statuses.includes(i.status)) {
      return false;
    }
    if (f.priority !== "all" && i.priority !== f.priority) {
      return false;
    }
    if (f.type !== "all" && i.issue_type !== f.type) {
      return false;
    }
    if (f.assignee !== "all" && (i.assignee ?? "") !== f.assignee) {
      return false;
    }
    return true;
  });
}

function cmp(a: Issue, b: Issue, key: SortKey): number {
  if (key === "priority") {
    return a.priority - b.priority;
  }
  const av = String(a[key] ?? "");
  const bv = String(b[key] ?? "");
  return av.localeCompare(bv);
}

export function sortIssues(issues: Issue[], s: Sort): Issue[] {
  const sorted = [...issues].sort((a, b) => cmp(a, b, s.key));
  return s.dir === "asc" ? sorted : sorted.reverse();
}

export const DEFAULT_SORT: Sort = { key: "priority", dir: "asc" };

const SORT_KEYS: SortKey[] = [
  "id",
  "title",
  "status",
  "priority",
  "issue_type",
  "assignee",
  "updated_at",
  "created_at",
];

// TableSearch is the URL query-string shape (compact keys), all optional so a
// bare URL means "defaults".
export interface TableSearch {
  q?: string;
  idg?: string;
  st?: string; // comma-separated statuses; absent = all
  pri?: number;
  type?: string;
  asgn?: string;
  sort?: SortKey;
  dir?: "asc" | "desc";
}

export function paramsToFilters(s: TableSearch): Filters {
  const sts = s.st
    ? (s.st.split(",").filter((v): v is Status => ALL_STATUSES.includes(v as Status)) as Status[])
    : [...ALL_STATUSES];
  return {
    text: s.q ?? "",
    idGlob: s.idg ?? "",
    statuses: sts.length ? sts : [...ALL_STATUSES],
    priority: s.pri ?? "all",
    type: s.type ?? "all",
    assignee: s.asgn ?? "all",
  };
}

export function paramsToSort(s: TableSearch): Sort {
  return {
    key: s.sort && SORT_KEYS.includes(s.sort) ? s.sort : DEFAULT_SORT.key,
    dir: s.dir === "desc" ? "desc" : "asc",
  };
}

// toParams emits only non-default values so shared URLs stay short.
export function toParams(f: Filters, s: Sort): TableSearch {
  return {
    q: f.text || undefined,
    idg: f.idGlob || undefined,
    st: f.statuses.length === ALL_STATUSES.length ? undefined : f.statuses.join(","),
    pri: f.priority === "all" ? undefined : f.priority,
    type: f.type === "all" ? undefined : f.type,
    asgn: f.assignee === "all" ? undefined : f.assignee,
    sort: s.key === DEFAULT_SORT.key && s.dir === DEFAULT_SORT.dir ? undefined : s.key,
    dir: s.key === DEFAULT_SORT.key && s.dir === DEFAULT_SORT.dir ? undefined : s.dir,
  };
}

export function uniqueSorted(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}
