import type { Issue } from "@/api"
import {
  ALL_STATUSES,
  allLabels,
  allPrefixes,
  applyFilters,
  buildGroups,
  buildLabelGroups,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  type Filters,
  filtersToParams,
  globToRegExp,
  idPrefix,
  paramsToFilters,
  paramsToSort,
  rootId,
  sortIssues,
  sortToParams,
  toGroupMode,
  toSortDir,
  toSortKey,
  uniqueSorted,
} from "@/lib/filter"

function issue(id: string, over: Partial<Issue> = {}): Issue {
  return {
    id,
    title: `title ${id}`,
    status: "open",
    priority: 2,
    issue_type: "task",
    ...over,
  }
}

const filters = (over: Partial<Filters> = {}): Filters => ({
  ...EMPTY_FILTERS,
  ...over,
})

describe("globToRegExp", () => {
  it("expands * to match any run of characters", () => {
    const re = globToRegExp("mulga-siv-*")
    expect(re.test("mulga-siv-231")).toBe(true)
    expect(re.test("mulga-siv-")).toBe(true)
    expect(re.test("mulga-abc-231")).toBe(false)
  })

  it("anchors the pattern at both ends", () => {
    const re = globToRegExp("abc")
    expect(re.test("abc")).toBe(true)
    expect(re.test("xabcx")).toBe(false)
  })

  it("matches case-insensitively", () => {
    expect(globToRegExp("MG-*").test("mg-1")).toBe(true)
  })

  // A dot is a literal in a glob; leaving it unescaped would make "mg-1"
  // match "mgX1" and silently widen every id filter.
  it("escapes regex metacharacters so they stay literal", () => {
    expect(globToRegExp("mg-1.2").test("mg-1.2")).toBe(true)
    expect(globToRegExp("mg-1.2").test("mg-1X2")).toBe(false)
    expect(globToRegExp("a+b").test("a+b")).toBe(true)
    expect(globToRegExp("a(b)").test("a(b)")).toBe(true)
    expect(globToRegExp("a[b]").test("a[b]")).toBe(true)
    expect(globToRegExp("a$b").test("a$b")).toBe(true)
  })
})

describe("applyFilters", () => {
  const rows = [
    issue("mg-1", { title: "Fix login", labels: ["ui"], assignee: "ana" }),
    issue("mg-2", {
      title: "Add index",
      status: "closed",
      priority: 0,
      issue_type: "bug",
      labels: ["db"],
    }),
    issue("other-3", { title: "Unassigned thing" }),
  ]

  it("returns everything when no filter is set", () => {
    expect(applyFilters(rows, filters())).toHaveLength(3)
  })

  it("matches text against the id", () => {
    expect(applyFilters(rows, filters({ text: "mg-1" }))).toEqual([rows[0]])
  })

  it("matches text against the title, case-insensitively", () => {
    expect(applyFilters(rows, filters({ text: "FIX LOGIN" }))).toEqual([
      rows[0],
    ])
  })

  it("ignores surrounding whitespace in the text filter", () => {
    expect(applyFilters(rows, filters({ text: "  login  " }))).toEqual([
      rows[0],
    ])
  })

  it("filters by id glob", () => {
    expect(applyFilters(rows, filters({ idGlob: "mg-*" }))).toHaveLength(2)
  })

  it("filters by status", () => {
    expect(applyFilters(rows, filters({ statuses: ["closed"] }))).toEqual([
      rows[1],
    ])
  })

  it("filters by priority", () => {
    expect(applyFilters(rows, filters({ priority: 0 }))).toEqual([rows[1]])
  })

  it("filters by issue type", () => {
    expect(applyFilters(rows, filters({ type: "bug" }))).toEqual([rows[1]])
  })

  it("filters by assignee", () => {
    expect(applyFilters(rows, filters({ assignee: "ana" }))).toEqual([rows[0]])
  })

  // An absent assignee is normalised to "", so the empty string is how the UI
  // asks for unassigned issues rather than meaning "no filter".
  it("treats an empty assignee as a request for unassigned issues", () => {
    expect(applyFilters(rows, filters({ assignee: "" }))).toEqual([
      rows[1],
      rows[2],
    ])
  })

  it("filters by label", () => {
    expect(applyFilters(rows, filters({ label: "db" }))).toEqual([rows[1]])
  })

  it("excludes issues with no labels when filtering by label", () => {
    expect(applyFilters(rows, filters({ label: "ui" }))).toEqual([rows[0]])
  })

  it("combines filters conjunctively", () => {
    const got = applyFilters(rows, filters({ idGlob: "mg-*", priority: 0 }))
    expect(got).toEqual([rows[1]])
  })
})

describe("sortIssues", () => {
  const rows = [
    issue("b", { priority: 2, title: "Beta" }),
    issue("a", { priority: 0, title: "Alpha" }),
    issue("c", { priority: 1, title: "Gamma" }),
  ]

  it("sorts by priority numerically, not lexically", () => {
    const got = sortIssues(
      [issue("x", { priority: 10 }), issue("y", { priority: 9 })],
      { key: "priority", dir: "asc" },
    )
    expect(got.map((i) => i.priority)).toEqual([9, 10])
  })

  it("sorts ascending by a string key", () => {
    const got = sortIssues(rows, { key: "title", dir: "asc" })
    expect(got.map((i) => i.title)).toEqual(["Alpha", "Beta", "Gamma"])
  })

  it("reverses for descending", () => {
    const got = sortIssues(rows, { key: "priority", dir: "desc" })
    expect(got.map((i) => i.priority)).toEqual([2, 1, 0])
  })

  it("treats a missing value as empty rather than throwing", () => {
    const got = sortIssues([issue("a", { assignee: "zoe" }), issue("b")], {
      key: "assignee",
      dir: "asc",
    })
    expect(got.map((i) => i.id)).toEqual(["b", "a"])
  })

  it("does not mutate its input", () => {
    const original = [...rows]
    sortIssues(rows, { key: "title", dir: "desc" })
    expect(rows).toEqual(original)
  })
})

describe("paramsToFilters", () => {
  it("returns defaults for an empty query string", () => {
    expect(paramsToFilters({})).toEqual(EMPTY_FILTERS)
  })

  it("parses a comma-separated status list", () => {
    expect(paramsToFilters({ st: "open,closed" }).statuses).toEqual([
      "open",
      "closed",
    ])
  })

  it("drops status values that are not real statuses", () => {
    expect(paramsToFilters({ st: "open,wontfix" }).statuses).toEqual(["open"])
  })

  // A URL carrying only junk statuses would otherwise filter everything out and
  // show an empty table with no way to tell why.
  it("falls back to all statuses when none survive parsing", () => {
    expect(paramsToFilters({ st: "nonsense" }).statuses).toEqual(ALL_STATUSES)
  })

  it("reads the remaining filters", () => {
    expect(
      paramsToFilters({
        q: "log",
        idg: "mg-*",
        pri: 1,
        type: "bug",
        asgn: "ana",
        lbl: "ui",
      }),
    ).toMatchObject({
      text: "log",
      idGlob: "mg-*",
      priority: 1,
      type: "bug",
      assignee: "ana",
      label: "ui",
    })
  })
})

describe("filtersToParams", () => {
  it("emits nothing for default filters, so a shared URL stays bare", () => {
    expect(filtersToParams(EMPTY_FILTERS)).toEqual({
      q: undefined,
      idg: undefined,
      st: undefined,
      pri: undefined,
      type: undefined,
      asgn: undefined,
      lbl: undefined,
    })
  })

  it("omits the status list when every status is selected", () => {
    expect(
      filtersToParams(filters({ statuses: [...ALL_STATUSES] })).st,
    ).toBeUndefined()
  })

  it("joins a partial status list", () => {
    expect(filtersToParams(filters({ statuses: ["open", "blocked"] })).st).toBe(
      "open,blocked",
    )
  })

  it("round-trips a non-default filter set", () => {
    const f = filters({
      text: "log",
      idGlob: "mg-*",
      statuses: ["open", "blocked"],
      priority: 1,
      type: "bug",
      assignee: "ana",
      label: "ui",
    })
    expect(paramsToFilters(filtersToParams(f))).toEqual(f)
  })
})

describe("sort params", () => {
  it("defaults an empty query to the default sort", () => {
    expect(paramsToSort({})).toEqual(DEFAULT_SORT)
  })

  it("keeps the default key when the URL sets only a direction", () => {
    expect(paramsToSort({ dir: "desc" })).toEqual({
      key: DEFAULT_SORT.key,
      dir: "desc",
    })
  })

  it("reads an explicit descending sort", () => {
    expect(paramsToSort({ sort: "title", dir: "desc" })).toEqual({
      key: "title",
      dir: "desc",
    })
  })

  it("emits nothing for the default sort", () => {
    expect(sortToParams(DEFAULT_SORT)).toEqual({
      sort: undefined,
      dir: undefined,
    })
  })

  it("emits both key and direction for a non-default sort", () => {
    expect(sortToParams({ key: "title", dir: "asc" })).toEqual({
      sort: "title",
      dir: "asc",
    })
  })

  it("round-trips a non-default sort", () => {
    const s = { key: "updated_at", dir: "desc" } as const
    expect(paramsToSort(sortToParams(s))).toEqual(s)
  })
})

describe("value narrowing", () => {
  it("accepts known sort keys and rejects anything else", () => {
    expect(toSortKey("title")).toBe("title")
    expect(toSortKey("nope")).toBeUndefined()
    expect(toSortKey(7)).toBeUndefined()
  })

  it("accepts only asc and desc", () => {
    expect(toSortDir("asc")).toBe("asc")
    expect(toSortDir("desc")).toBe("desc")
    expect(toSortDir("sideways")).toBeUndefined()
  })

  it("accepts only known group modes", () => {
    expect(toGroupMode("epic")).toBe("epic")
    expect(toGroupMode("label")).toBe("label")
    expect(toGroupMode("none")).toBe("none")
    expect(toGroupMode("kanban")).toBeUndefined()
  })
})

describe("uniqueSorted", () => {
  it("dedupes, drops empties and sorts", () => {
    expect(uniqueSorted(["b", "a", "b", undefined, "", "c"])).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  it("returns an empty array for no usable values", () => {
    expect(uniqueSorted([undefined, ""])).toEqual([])
  })
})

describe("id helpers", () => {
  it("strips the dotted child suffix to find the root", () => {
    expect(rootId("mulga-siv-231.7.4")).toBe("mulga-siv-231")
    expect(rootId("mulga-siv-231")).toBe("mulga-siv-231")
  })

  it("drops the numeric tail to find the prefix", () => {
    expect(idPrefix("mulga-siv-477")).toBe("mulga-siv")
    expect(idPrefix("mulga-7g1")).toBe("mulga")
    expect(idPrefix("mulga-siv-231.7")).toBe("mulga-siv")
  })

  it("returns the id unchanged when there is no tail to drop", () => {
    expect(idPrefix("solo")).toBe("solo")
  })

  it("lists every distinct prefix, sorted", () => {
    const rows = [issue("b-2"), issue("a-1"), issue("b-3"), issue("a-9.1")]
    expect(allPrefixes(rows)).toEqual(["a", "b"])
  })
})

describe("buildGroups", () => {
  it("nests dotted children under their root", () => {
    const rows = [issue("mg-1"), issue("mg-1.1"), issue("mg-1.2")]
    expect(buildGroups(rows)).toEqual([
      { kind: "epic", issue: rows[0], children: [rows[1], rows[2]] },
    ])
  })

  // A child whose parent was filtered out must still be reachable, otherwise
  // narrowing the filter would make rows vanish entirely.
  it("keeps a child loose when its root is not in the rows", () => {
    const rows = [issue("mg-1.1")]
    expect(buildGroups(rows)).toEqual([{ kind: "loose", issue: rows[0] }])
  })

  it("marks a childless issue as loose", () => {
    const rows = [issue("mg-9")]
    expect(buildGroups(rows)).toEqual([{ kind: "loose", issue: rows[0] }])
  })

  it("preserves the incoming order of parents and children", () => {
    const rows = [issue("b-1"), issue("a-1"), issue("b-1.2"), issue("b-1.1")]
    const got = buildGroups(rows)
    expect(got.map((n) => n.issue.id)).toEqual(["b-1", "a-1"])
    expect(got[0]).toMatchObject({
      kind: "epic",
      children: [rows[2], rows[3]],
    })
  })
})

describe("label grouping", () => {
  const rows = [
    issue("mg-1", { labels: ["ui", "bug"] }),
    issue("mg-2", { labels: ["bug"] }),
    issue("mg-3"),
  ]

  it("lists every distinct label, sorted", () => {
    expect(allLabels(rows)).toEqual(["bug", "ui"])
  })

  it("buckets by label alphabetically", () => {
    expect(buildLabelGroups(rows).map((g) => g.label)).toEqual([
      "bug",
      "ui",
      "",
    ])
  })

  it("repeats a multi-label issue under each of its labels", () => {
    const groups = buildLabelGroups(rows)
    expect(groups[0]?.issues).toEqual([rows[0], rows[1]])
    expect(groups[1]?.issues).toEqual([rows[0]])
  })

  it("puts the unlabeled bucket last", () => {
    const groups = buildLabelGroups(rows)
    expect(groups.at(-1)).toEqual({ label: "", issues: [rows[2]] })
  })

  it("omits the unlabeled bucket when every issue has a label", () => {
    const labeled = [issue("mg-1", { labels: ["ui"] })]
    expect(buildLabelGroups(labeled).map((g) => g.label)).toEqual(["ui"])
  })
})
