import { useSyncExternalStore } from "react"

// The acting identity (a GitHub username) sent as bd --actor on every write.
// maggie has no login; this is a self-asserted audit label persisted locally and
// shared across components via an external store so the header picker and the
// drawer stay in sync. "" means no identity chosen yet.
const KEY = "maggie.actor"
const listeners = new Set<() => void>()

function read(): string {
  return localStorage.getItem(KEY) ?? ""
}

function write(v: string) {
  if (v) {
    localStorage.setItem(KEY, v)
  } else {
    localStorage.removeItem(KEY)
  }
  for (const l of listeners) {
    l()
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useActor(): [string, (v: string) => void] {
  const actor = useSyncExternalStore(subscribe, read, () => "")
  return [actor, write]
}
