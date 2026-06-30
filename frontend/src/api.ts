export type Status = "open" | "in_progress" | "blocked" | "deferred" | "closed";

export interface DepRef {
  id: string;
  title: string;
  status: Status;
  priority: number;
  issue_type: string;
  dependency_type?: string;
}

export interface Issue {
  id: string;
  title: string;
  description?: string;
  acceptance_criteria?: string;
  notes?: string;
  status: Status;
  priority: number;
  issue_type: string;
  assignee?: string;
  owner?: string;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
  closed_at?: string;
  close_reason?: string;
  dependency_count?: number;
  dependent_count?: number;
  comment_count?: number;
  dependencies?: DepRef[];
  dependents?: DepRef[];
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchIssues(): Promise<Issue[]> {
  return getJSON<Issue[]>("/api/issues?all=true&limit=2000");
}

export function fetchReady(): Promise<Issue[]> {
  return getJSON<Issue[]>("/api/ready");
}

export async function fetchIssue(id: string): Promise<Issue | undefined> {
  const arr = await getJSON<Issue[]>(`/api/issue?id=${encodeURIComponent(id)}`);
  return arr[0];
}
