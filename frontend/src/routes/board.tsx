import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"

import type { Issue, Status } from "@/api"
import { IssueCard } from "@/components/issue-card"
import { useActor } from "@/lib/actor"
import { applyFilters, paramsToFilters } from "@/lib/filter"
import { useActors, useIssues, useUpdateIssue } from "@/queries"

export const Route = createFileRoute("/board")({
  component: Board,
})

const COLUMNS: Status[] = [
  "open",
  "in_progress",
  "blocked",
  "deferred",
  "closed",
]

// A pending claim: an unassigned bead dropped into in_progress prompts for an
// assignee before the move is applied.
interface Claim {
  issue: Issue
  to: Status
}

function Board() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const { data, isLoading, error } = useIssues()
  const [actor] = useActor()
  const update = useUpdateIssue()

  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<Status | null>(null)
  const [claim, setClaim] = useState<Claim | null>(null)

  const filters = paramsToFilters(search)
  const items = useMemo(
    () => applyFilters(data ?? [], filters),
    [data, filters],
  )

  const select = async (id: string) =>
    navigate({ to: ".", search: (s) => ({ ...s, issue: id }) })

  const move = (issue: Issue, to: Status, assignee?: string) => {
    if (!actor || to === issue.status) {
      return
    }
    const patch: { status: Status; assignee?: string } = { status: to }
    if (assignee !== undefined) {
      patch.assignee = assignee
    }
    update.mutate({ id: issue.id, actor, patch })
  }

  const drop = (to: Status) => {
    setOverCol(null)
    const issue = items.find((i) => i.id === dragId)
    setDragId(null)
    if (!issue || to === issue.status) {
      return
    }
    // Claiming: an unassigned bead entering in_progress asks who owns it.
    if (to === "in_progress" && !issue.assignee) {
      setClaim({ issue, to })
      return
    }
    move(issue, to)
  }

  if (isLoading) {
    return <p className="text-muted">loading…</p>
  }
  if (error) {
    return <p className="text-st-blocked">error: {error.message}</p>
  }

  const grouped = new Map<Status, Issue[]>(COLUMNS.map((s) => [s, []]))
  for (const issue of items) {
    grouped.get(issue.status)?.push(issue)
  }

  return (
    <>
      {actor ? null : (
        <p className="mb-3 rounded-md border border-line bg-panel px-3 py-2 text-xs text-muted">
          set your identity in the header (“acting as”) to drag beads between
          columns.
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
        {COLUMNS.map((status) => (
          <section
            key={status}
            onDragOver={(e) => {
              if (dragId) {
                e.preventDefault()
                setOverCol(status)
              }
            }}
            onDragLeave={() => {
              setOverCol((c) => (c === status ? null : c))
            }}
            onDrop={() => {
              drop(status)
            }}
            className={`rounded-lg transition-colors ${
              overCol === status ? "bg-surface2/40 ring-1 ring-accent/40" : ""
            }`}
          >
            <h2 className="mb-2 px-1 text-xs tracking-widest text-muted uppercase">
              {status.replace("_", " ")} ({grouped.get(status)?.length ?? 0})
            </h2>
            {grouped.get(status)?.map((issue) => (
              <div
                key={issue.id}
                draggable={!!actor}
                onDragStart={(e) => {
                  setDragId(issue.id)
                  e.dataTransfer.effectAllowed = "move"
                }}
                onDragEnd={() => {
                  setDragId(null)
                  setOverCol(null)
                }}
                className={
                  dragId === issue.id
                    ? "opacity-50"
                    : actor
                      ? "cursor-grab"
                      : ""
                }
              >
                <IssueCard issue={issue} onSelect={select} />
              </div>
            ))}
          </section>
        ))}
      </div>

      {claim ? (
        <ClaimDialog
          claim={claim}
          defaultAssignee={actor}
          onCancel={() => {
            setClaim(null)
          }}
          onConfirm={(assignee) => {
            move(claim.issue, claim.to, assignee)
            setClaim(null)
          }}
        />
      ) : null}
    </>
  )
}

function ClaimDialog({
  claim,
  defaultAssignee,
  onCancel,
  onConfirm,
}: {
  claim: Claim
  defaultAssignee: string
  onCancel: () => void
  onConfirm: (assignee: string) => void
}) {
  const { data } = useActors()
  const [assignee, setAssignee] = useState(defaultAssignee)
  const roster = data ?? []
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-80 rounded-lg border border-line bg-panel p-4 shadow-2xl">
        <h3 className="text-sm font-semibold">Start work on this bead</h3>
        <p className="mt-1 text-xs text-muted">
          <span className="font-mono text-accent">{claim.issue.id}</span> is
          unassigned. Assign it before moving to in progress.
        </p>
        <select
          className="mt-3 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
          value={assignee}
          onChange={(e) => {
            setAssignee(e.target.value)
          }}
        >
          <option value="">leave unassigned</option>
          {roster.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-line px-3 py-1 text-xs text-muted hover:text-text"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(assignee)
            }}
            className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-bg hover:bg-accent/90"
          >
            move
          </button>
        </div>
      </div>
    </div>
  )
}
