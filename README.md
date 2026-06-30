# Maggie

Lightweight web UI for viewing and managing [Beads](https://github.com/steveyegge/beads)
issues. Part of the Mulga stack.

Reads come from the `bd` CLI (`bd ... --json`); writes (later) also go through
`bd` so bead invariants stay intact. See [docs/plan.md](docs/plan.md).

## Stack

- Backend: Go HTTP server, embeds the built frontend.
- Frontend: Vite + React 19 + TanStack Router/Query + Tailwind 4 (matches
  `spinifex-ui` conventions: oxlint/oxfmt, pnpm).

## Build & run

```bash
make all     # build frontend -> embed -> build Go binary
make run     # build + serve (default MAGGIE_BEADS_DIR=$HOME/Development/mulga)
# open http://localhost:8088
```

The Go binary embeds `cmd/maggie/web` (the Vite build output). `make build`
alone works only after `make ui` has produced that output at least once.

## Frontend dev (hot reload)

```bash
make run          # backend on :8088 (terminal 1)
make dev          # Vite dev server on :3001, proxies /api -> :8088 (terminal 2)
```

## Config (env)

| Var                 | Default | Description                          |
|---------------------|---------|--------------------------------------|
| `MAGGIE_ADDR`      | `:8088` | Listen address                       |
| `MAGGIE_BEADS_DIR` | `.`     | Working dir containing `.beads/`     |
| `MAGGIE_BD_BIN`    | `bd`    | Path to the `bd` binary              |

## Endpoints

- `GET /` — SPA (board / ready / graph)
- `GET /api/issues?status=&priority=&limit=&all=` — list issues
- `GET /api/ready` — ready-to-work issues
- `GET /api/issue?id=<id>` — issue detail
- `GET /api/graph` — interactive dependency graph (HTML)
