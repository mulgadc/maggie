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

- `GET /` — SPA (table / board / ready / graph)
- `GET /api/issues?status=&priority=&limit=&all=` — list issues
- `GET /api/ready` — ready-to-work issues
- `GET /api/issue?id=<id>` — issue detail
- `GET /api/graph` — dependency edges (JSON), rendered client-side

## Docker (portable maggie + dolt stack)

Packages maggie, `bd`, and `dolt` into one image; compose runs a private dolt
server plus the maggie web UI. Data is a **manual snapshot import** — no live
mirror. The team keeps editing beads via git/JSONL as usual; this is a
read-only viewer seeded on demand. Lifts to another host via the named volume.

```bash
# 1. drop a snapshot of the source-of-truth jsonl
mkdir -p snapshot
cp $HOME/Development/mulga/.beads/issues.jsonl snapshot/issues.jsonl

# 2. build + seed + run
make docker-build
make docker-seed     # import snapshot -> dolt volume
make docker-up       # http://localhost:8088

# later: refresh the data from a fresh snapshot
cp .../issues.jsonl snapshot/issues.jsonl
make docker-refresh  # stop dolt -> re-seed -> start dolt
```

Image versions are pinned via build args (`BD_VERSION`, `DOLT_VERSION`,
`GO_VERSION`) in the `Dockerfile`.

> **Security:** maggie has no built-in auth and the compose file publishes
> `:8088`. Front it with a VPN or an authenticating reverse proxy, and keep the
> dolt port (`3307`) internal — never publish it.
