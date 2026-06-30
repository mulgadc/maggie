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

## Testing

- Unit: argv construction and param allowlisting in `internal/beads`.
- Manual: run against the local mulga `.beads` dir, verify board/ready/graph load.
- Later: integration against the banksia Dolt server in server mode.
