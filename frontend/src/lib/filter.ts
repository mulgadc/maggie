import type { Issue, Status } from "@/api";

export interface Filters {
  text: string; // matches id or title (substring, case-insensitive)
  idGlob: string; // glob on id, e.g. "mulga-siv-*"
  status: Status | "all";
  priority: number | "all";
  type: string | "all";
  assignee: string | "all";
}

export const EMPTY_FILTERS: Filters = {
  text: "",
  idGlob: "",
  status: "all",
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
    if (f.status !== "all" && i.status !== f.status) {
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

export function uniqueSorted(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}
