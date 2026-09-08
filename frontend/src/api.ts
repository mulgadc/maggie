export type Status = "open" | "in_progress" | "blocked" | "deferred" | "closed"

export interface DepRef {
  id: string
  title: string
  status: Status
  priority: number
  issue_type: string
  dependency_type?: string
}

export interface Comment {
  id: string
  issue_id?: string
  author?: string
  text: string
  created_at?: string
}

export interface Issue {
  id: string
  title: string
  description?: string
  acceptance_criteria?: string
  notes?: string
  status: Status
  priority: number
  issue_type: string
  assignee?: string
  owner?: string
  created_at?: string
  created_by?: string
  updated_at?: string
  closed_at?: string
  close_reason?: string
  dependency_count?: number
  dependent_count?: number
  comment_count?: number
  labels?: string[]
  dependencies?: DepRef[]
  dependents?: DepRef[]
  comments?: Comment[]
}

export interface Edge {
  from: string
  to: string
  dashed: boolean
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}`)
  }
  return await (res.json() as Promise<T>)
}

export async function fetchIssues(): Promise<Issue[]> {
  return getJSON<Issue[]>("/api/issues?all=true&limit=100000")
}

export async function fetchReady(): Promise<Issue[]> {
  return getJSON<Issue[]>("/api/ready")
}

export async function fetchGraph(): Promise<Edge[]> {
  return getJSON<Edge[]>("/api/graph")
}

export async function fetchActors(): Promise<string[]> {
  return getJSON<string[]>("/api/actors")
}

export async function fetchIssue(id: string): Promise<Issue | undefined> {
  const arr = await getJSON<Issue[]>(`/api/issue?id=${encodeURIComponent(id)}`)
  return arr[0]
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(
      (await res.text().catch(() => "")) || `${path} -> ${res.status}`,
    )
  }
  if (res.status === 204) {
    return undefined as T
  }
  const arr = (await res.json()) as Issue[]
  return arr[0] as T
}

// UpdatePayload mirrors the backend: absent fields are omitted (left unchanged);
// assignee "" clears it. add_labels/remove_labels carry label deltas.
export interface UpdatePayload {
  status?: Status
  priority?: string
  assignee?: string
  description?: string
  notes?: string
  acceptance?: string
  add_labels?: string[]
  remove_labels?: string[]
}

export async function updateIssue(
  id: string,
  actor: string,
  patch: UpdatePayload,
): Promise<Issue | undefined> {
  return postJSON("/api/issue/update", { id, actor, ...patch })
}

export async function addComment(
  id: string,
  actor: string,
  text: string,
): Promise<Issue | undefined> {
  return postJSON("/api/issue/comment", { id, actor, text })
}

export type DepType = "blocks" | "relates-to" | "parent"

export async function addDep(
  id: string,
  actor: string,
  dependsOn: string,
  type: DepType,
): Promise<Issue | undefined> {
  return postJSON("/api/issue/dep", { id, actor, depends_on: dependsOn, type })
}
