# Waratah — Beads Web UI

**Status: In progress**

## Summary

Waratah is a lightweight web UI for viewing and managing Beads issues backed by
a centralised Dolt server (running on banksia). It gives the team a live, shared
view of bead state without forcing everyone onto the CLI, while keeping the CLI
as the authoritative write path.

## Context / Problem

Beads currently uses `.beads/issues.jsonl` as the git-synced source of truth.
We are testing a migration to a centralised `dolt sql-server` on banksia, which
gives live shared state and version-control features (history, diffs, time
travel via `AS OF`). Once that exists we want a nicer interface than the CLI or
a cron-regenerated static HTML file.

Beads is CLI-first with no official web UI, but every command emits `--json`
and Dolt speaks the MySQL wire protocol, so a thin custom UI is cheap to build.

## Design

```
React/HTML UI ──HTTP/SSE──> Go service ──┬─ READ:  dolt sql-server :3307 (later) / bd --json (now)
                                         └─ WRITE: shell to `bd ... --json`
```

### Core rule: split read and write paths

- **Reads** come from `bd ... --json` initially, and may move to direct Dolt SQL
  queries later for live streaming and `AS OF` history.
- **Writes go through the `bd` CLI only — never raw SQL.** `bd` maintains events,
  labels, dependency integrity, JSONL export and the audit trail. Bypassing it
  with raw SQL corrupts bead invariants.

### Security

The Go service does not pass arbitrary arguments to `bd`. Each endpoint maps to a
fixed `bd` subcommand with an allowlist of query parameters (status, priority,
limit, id). No shell interpolation — args are passed as an exec argv slice.

## Phases

1. **Read-only MVP (now):** Go service proxies `bd list/ready/show/graph --json`,
   serves a single-page frontend with a status board, ready queue, issue detail
   and the embedded dependency graph. Zero risk to bead data.
2. **Live updates:** SSE endpoint polling a watermark (`MAX(updated_at)` or Dolt
   commit log) and pushing changes to clients. Removes any need for cron.
3. **Direct Dolt reads:** swap the read path to a MySQL pool against banksia for
   speed and `AS OF` history/diff views.
4. **Writes via `bd`:** create/update/close endpoints shelling to `bd`.

## Files

- `cmd/waratah/main.go` — HTTP server, routing, static embed.
- `internal/beads/` — `bd` exec wrapper and typed helpers.
- `cmd/waratah/web/` — frontend (vanilla SPA for MVP; can grow to React off
  spinifex-ui). Lives under the main package so it can be `go:embed`-ed.
- `docs/plan.md` — this doc.

## Snapshot server eval (banksia)

The team is pinned to bd 0.50.0 with a `no-db: true` (git/JSONL) workflow and no
database at all. To evaluate a centralised Dolt server + Waratah without
disrupting anyone, we seed a throwaway server from a one-off snapshot of
`issues.jsonl` — not a mirror, not a cutover. Git/JSONL stays the source of
truth; the team is untouched. A full cutover (everyone on server mode, JSONL
retired, likely a bd bump to a stable release) is a separate future project.

`scripts/beads-server-banksia.sh` automates this:

```bash
./scripts/beads-server-banksia.sh seed  /path/to/issues.jsonl   # one-time import
./scripts/beads-server-banksia.sh serve                         # dolt sql-server
```

Then point a client and Waratah at it:

```bash
bd init --backend dolt --server --server-host <banksia> --server-port 3307
bd dolt set database beads
bd dolt test
WARATAH_BEADS_DIR=<client-dir> ./waratah
```

End-to-end proven locally: snapshot of 1507 issues -> Dolt -> sql-server ->
bd server-mode client -> Waratah serving 1506 live issues.

### Gotchas (cost us real time)

- **Install dolt from the release tarball, not `go install`** — dolt's go.mod has
  replace directives that break `go install`.
- **`bd migrate --to-dolt` is SQLite -> Dolt only.** From a `no-db` JSONL repo the
  path is `bd init --backend dolt --from-jsonl`.
- **Database-name mismatch:** `--from-jsonl` imports into a DB named `beads`, but
  bd's read config defaults to `beads_<prefix>`. Import looks successful yet
  `bd stats` shows 0. Fix: `bd dolt set database beads`.
- **bd scopes reads by git repo id** — run inside a git repo or reads return 0.
- **A server-mode client must be a separate dir** from the server's data-dir;
  reconfiguring the served dir fails with "database is locked by another dolt
  process".

## Testing

- Unit: argv construction and param allowlisting in `internal/beads`.
- Manual: run against the local mulga `.beads` dir, verify board/ready/graph load.
- Integration: against a Dolt server in server mode (proven via the snapshot eval).
