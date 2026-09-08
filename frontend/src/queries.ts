import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { DepType, Issue, UpdatePayload } from "@/api"
import {
  addComment,
  addDep,
  fetchActors,
  fetchGraph,
  fetchIssue,
  fetchIssues,
  fetchReady,
  updateIssue,
} from "@/api"

const REFETCH_MS = 10_000

export function useIssues() {
  return useQuery({
    queryKey: ["issues"],
    queryFn: fetchIssues,
    refetchInterval: REFETCH_MS,
  })
}

export function useReady() {
  return useQuery({
    queryKey: ["ready"],
    queryFn: fetchReady,
    refetchInterval: REFETCH_MS,
  })
}

export function useActors() {
  return useQuery({
    queryKey: ["actors"],
    queryFn: fetchActors,
    staleTime: 30 * 60_000,
  })
}

export function useGraph() {
  return useQuery({
    queryKey: ["graph"],
    queryFn: fetchGraph,
    refetchInterval: REFETCH_MS,
  })
}

export function useIssue(id: string) {
  return useQuery({
    queryKey: ["issue", id],
    queryFn: async () => fetchIssue(id),
    enabled: id !== "",
  })
}

// useIssueWrites returns the drawer mutations. On success each seeds the fresh
// issue into the detail cache and invalidates the list/ready/graph views so
// every tab reflects the change without a manual reload.
function useIssueWrites() {
  const qc = useQueryClient()
  const settle = (fresh: Issue | undefined, id: string) => {
    if (fresh) {
      qc.setQueryData(["issue", id], fresh)
    }
    qc.invalidateQueries({ queryKey: ["issues"] })
    qc.invalidateQueries({ queryKey: ["ready"] })
    qc.invalidateQueries({ queryKey: ["graph"] })
    qc.invalidateQueries({ queryKey: ["issue", id] })
  }
  return { settle }
}

export function useUpdateIssue() {
  const { settle } = useIssueWrites()
  return useMutation({
    mutationFn: async (v: {
      id: string
      actor: string
      patch: UpdatePayload
    }) => updateIssue(v.id, v.actor, v.patch),
    onSuccess: (fresh, v) => {
      settle(fresh, v.id)
    },
  })
}

export function useAddComment() {
  const { settle } = useIssueWrites()
  return useMutation({
    mutationFn: async (v: { id: string; actor: string; text: string }) =>
      addComment(v.id, v.actor, v.text),
    onSuccess: (fresh, v) => {
      settle(fresh, v.id)
    },
  })
}

export function useAddDep() {
  const { settle } = useIssueWrites()
  return useMutation({
    mutationFn: async (v: {
      id: string
      actor: string
      dependsOn: string
      type: DepType
    }) => addDep(v.id, v.actor, v.dependsOn, v.type),
    onSuccess: (fresh, v) => {
      settle(fresh, v.id)
    },
  })
}
