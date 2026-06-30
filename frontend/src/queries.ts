import { useQuery } from "@tanstack/react-query";

import { fetchIssue, fetchIssues, fetchReady } from "@/api";

const REFETCH_MS = 10_000;

export function useIssues() {
  return useQuery({
    queryKey: ["issues"],
    queryFn: fetchIssues,
    refetchInterval: REFETCH_MS,
  });
}

export function useReady() {
  return useQuery({
    queryKey: ["ready"],
    queryFn: fetchReady,
    refetchInterval: REFETCH_MS,
  });
}

export function useIssue(id: string) {
  return useQuery({
    queryKey: ["issue", id],
    queryFn: () => fetchIssue(id),
    enabled: id !== "",
  });
}
