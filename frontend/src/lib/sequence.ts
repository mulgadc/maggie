import type { Edge, Issue } from "@/api"

// Only actionable statuses take part in a work sequence; closed/deferred drop
// out. Lower rank = pick sooner.
const STATUS_RANK: Record<string, number> = {
  in_progress: 0,
  open: 1,
  blocked: 2,
}

function less(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] < b[i]
    }
  }
  return false
}

// suggestSequence orders beads into a logical "tackle next" list. Solid graph
// edges (from blocks to) force prerequisites first via a Kahn-style topological
// walk. When several beads are unblocked it breaks ties by: active work first,
// then priority, then label affinity with the previous pick (so loosely related
// beads stay grouped), then most-recently updated.
export function suggestSequence(
  issues: Issue[],
  edges: Edge[],
  limit = 16,
): Issue[] {
  const actionable = issues.filter((i) => STATUS_RANK[i.status] !== undefined)
  const inSet = new Set(actionable.map((i) => i.id))
  const byId = new Map(actionable.map((i) => [i.id, i]))

  const blockers = new Map<string, Set<string>>()
  for (const id of inSet) {
    blockers.set(id, new Set())
  }
  for (const e of edges) {
    if (e.dashed || !inSet.has(e.from) || !inSet.has(e.to)) {
      continue
    }
    blockers.get(e.to)?.add(e.from)
  }

  const remaining = new Set(inSet)
  const done = new Set<string>()
  const order: Issue[] = []
  let prevLabels = new Set<string>()

  const blocked = (id: string) => {
    for (const b of blockers.get(id) ?? []) {
      if (!done.has(b)) {
        return true
      }
    }
    return false
  }

  while (order.length < limit && remaining.size) {
    const pool = [...remaining].filter((id) => !blocked(id))
    // Fall back to everything left if a cycle leaves nothing unblocked.
    const candidates = pool.length ? pool : [...remaining]
    let best: string | null = null
    let bestKey: number[] | null = null
    for (const id of candidates) {
      const i = byId.get(id)
      if (!i) {
        continue
      }
      const affinity = (i.labels ?? []).some((l) => prevLabels.has(l)) ? 0 : 1
      const updated = Date.parse(i.updated_at ?? "")
      const key = [
        STATUS_RANK[i.status] ?? 3,
        i.priority,
        affinity,
        Number.isNaN(updated) ? 0 : -updated,
      ]
      if (!bestKey || less(key, bestKey)) {
        bestKey = key
        best = id
      }
    }
    if (!best) {
      break
    }
    const picked = byId.get(best)
    if (picked) {
      order.push(picked)
      prevLabels = new Set(picked.labels ?? [])
    }
    remaining.delete(best)
    done.add(best)
  }
  return order
}

// hasPrereqInSet reports whether an ordered bead depends on an earlier one, so
// the timeline can mark dependency-forced steps.
export function prereqIds(
  issues: Issue[],
  edges: Edge[],
): Map<string, string[]> {
  const ids = new Set(issues.map((i) => i.id))
  const m = new Map<string, string[]>()
  for (const e of edges) {
    if (e.dashed || !ids.has(e.from) || !ids.has(e.to)) {
      continue
    }
    m.set(e.to, [...(m.get(e.to) ?? []), e.from])
  }
  return m
}
