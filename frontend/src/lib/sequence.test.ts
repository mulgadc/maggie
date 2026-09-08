import type { Edge, Issue } from "@/api"
import { prereqIds, suggestSequence } from "@/lib/sequence"

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

const edge = (from: string, to: string, dashed = false): Edge => ({
  from,
  to,
  dashed,
})

const ids = (issues: Issue[]) => issues.map((i) => i.id)

describe("suggestSequence", () => {
  it("drops issues that are not actionable", () => {
    const rows = [
      issue("a", { status: "closed" }),
      issue("b", { status: "deferred" }),
      issue("c"),
    ]
    expect(ids(suggestSequence(rows, []))).toEqual(["c"])
  })

  it("returns an empty sequence when nothing is actionable", () => {
    expect(suggestSequence([issue("a", { status: "closed" })], [])).toEqual([])
  })

  // A solid edge means from blocks to, so the blocker has to come first even
  // though it is the lower-priority piece of work.
  it("orders a prerequisite ahead of the work it blocks", () => {
    const rows = [issue("a", { priority: 0 }), issue("b", { priority: 4 })]
    expect(ids(suggestSequence(rows, [edge("b", "a")]))).toEqual(["b", "a"])
  })

  it("follows a chain of prerequisites", () => {
    const rows = [
      issue("a", { priority: 0 }),
      issue("b", { priority: 1 }),
      issue("c", { priority: 2 }),
    ]
    const edges = [edge("c", "b"), edge("b", "a")]
    expect(ids(suggestSequence(rows, edges))).toEqual(["c", "b", "a"])
  })

  // Dashed edges are parent/child links, which say nothing about ordering.
  it("ignores dashed edges", () => {
    const rows = [issue("a", { priority: 0 }), issue("b", { priority: 4 })]
    expect(ids(suggestSequence(rows, [edge("b", "a", true)]))).toEqual([
      "a",
      "b",
    ])
  })

  it("ignores edges pointing outside the actionable set", () => {
    const rows = [issue("a", { priority: 0 }), issue("b", { priority: 4 })]
    const edges = [edge("ghost", "a"), edge("a", "ghost")]
    expect(ids(suggestSequence(rows, edges))).toEqual(["a", "b"])
  })

  it("ignores an edge from an issue that is already closed", () => {
    const rows = [
      issue("a", { priority: 0 }),
      issue("done", { status: "closed" }),
    ]
    expect(ids(suggestSequence(rows, [edge("done", "a")]))).toEqual(["a"])
  })

  it("puts work in progress before work not yet started", () => {
    const rows = [
      issue("a", { priority: 0 }),
      issue("b", { status: "in_progress", priority: 4 }),
    ]
    expect(ids(suggestSequence(rows, []))).toEqual(["b", "a"])
  })

  it("puts blocked work last among the statuses", () => {
    const rows = [
      issue("a", { status: "blocked", priority: 0 }),
      issue("b", { status: "open", priority: 4 }),
    ]
    expect(ids(suggestSequence(rows, []))).toEqual(["b", "a"])
  })

  it("breaks a status tie by priority", () => {
    const rows = [issue("a", { priority: 3 }), issue("b", { priority: 1 })]
    expect(ids(suggestSequence(rows, []))).toEqual(["b", "a"])
  })

  // Once a bead is picked, the next pick prefers one sharing a label so related
  // work stays grouped instead of ping-ponging between areas.
  it("prefers a bead sharing a label with the previous pick", () => {
    const rows = [
      issue("a", { priority: 0, labels: ["ui"] }),
      issue("b", { priority: 1, labels: ["db"] }),
      issue("c", { priority: 1, labels: ["ui"] }),
    ]
    expect(ids(suggestSequence(rows, []))).toEqual(["a", "c", "b"])
  })

  it("does not let label affinity outrank priority", () => {
    const rows = [
      issue("a", { priority: 0, labels: ["ui"] }),
      issue("b", { priority: 1, labels: ["db"] }),
      issue("c", { priority: 3, labels: ["ui"] }),
    ]
    expect(ids(suggestSequence(rows, []))).toEqual(["a", "b", "c"])
  })

  it("breaks a full tie by most recently updated", () => {
    const rows = [
      issue("old", { updated_at: "2026-01-01T00:00:00Z" }),
      issue("new", { updated_at: "2026-06-01T00:00:00Z" }),
    ]
    expect(ids(suggestSequence(rows, []))).toEqual(["new", "old"])
  })

  it("treats an unparseable timestamp as the oldest", () => {
    const rows = [
      issue("bad", { updated_at: "not a date" }),
      issue("good", { updated_at: "2026-06-01T00:00:00Z" }),
    ]
    expect(ids(suggestSequence(rows, []))).toEqual(["good", "bad"])
  })

  it("handles a missing timestamp without throwing", () => {
    const rows = [issue("a"), issue("b")]
    expect(ids(suggestSequence(rows, []))).toHaveLength(2)
  })

  it("caps the sequence at the limit", () => {
    const rows = ["a", "b", "c", "d", "e"].map((id) => issue(id))
    expect(suggestSequence(rows, [], 2)).toHaveLength(2)
  })

  it("defaults to a limit of 16", () => {
    const rows = Array.from({ length: 20 }, (_, n) => issue(`mg-${n}`))
    expect(suggestSequence(rows, [])).toHaveLength(16)
  })

  // A dependency cycle leaves nothing unblocked. The walk must still drain the
  // pool rather than stalling and returning a short list.
  it("still returns every bead when a cycle blocks everything", () => {
    const rows = [issue("a"), issue("b")]
    const edges = [edge("a", "b"), edge("b", "a")]
    expect(ids(suggestSequence(rows, edges)).toSorted()).toEqual(["a", "b"])
  })

  it("returns each bead exactly once", () => {
    const rows = [issue("a"), issue("b"), issue("c")]
    const got = ids(suggestSequence(rows, [edge("a", "b")]))
    expect(new Set(got).size).toBe(got.length)
  })
})

describe("prereqIds", () => {
  const rows = [issue("a"), issue("b"), issue("c")]

  it("maps a bead to the beads that block it", () => {
    expect(prereqIds(rows, [edge("a", "b")]).get("b")).toEqual(["a"])
  })

  it("accumulates several prerequisites", () => {
    const m = prereqIds(rows, [edge("a", "c"), edge("b", "c")])
    expect(m.get("c")).toEqual(["a", "b"])
  })

  it("skips dashed edges", () => {
    expect(prereqIds(rows, [edge("a", "b", true)]).size).toBe(0)
  })

  it("skips edges referencing beads outside the list", () => {
    expect(prereqIds(rows, [edge("ghost", "b"), edge("a", "ghost")]).size).toBe(
      0,
    )
  })

  it("returns an empty map when there are no edges", () => {
    expect(prereqIds(rows, []).size).toBe(0)
  })
})
