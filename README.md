# Maggie

Lightweight web UI for viewing and managing [Beads](https://github.com/steveyegge/beads) issues. Part of the Mulga stack.

Reads come from the `bd` CLI (`bd ... --json`); writes (e.g. drag-and-drop status changes on the board) also go through `bd` so bead invariants stay intact.

## Stack

- Backend: Go HTTP server, embeds the built frontend.
- Frontend: Vite + React 19 + TanStack Router/Query + Tailwind 4

## Build & run

```bash
make all     # build frontend -> embed -> build Go binary
make run     # build + serve the repo in the current dir (MAGGIE_BEADS_DIR=.)
# open http://localhost:8088
```

The Go binary embeds `cmd/maggie/web`, the Vite build output. That directory is a build artefact and is not in git, so `make build` runs `make ui` for you when it is missing. A bare `go build ./cmd/maggie` on a fresh clone fails until it exists.

## Frontend dev (hot reload)

```bash
make run          # backend on :8088 (terminal 1)
make dev          # Vite dev server on :3001, proxies /api -> :8088 (terminal 2)
```

## Config (env)

| Var                 | Default | Description                                         |
|---------------------|---------|-----------------------------------------------------|
| `MAGGIE_ADDR`      | `:8088` | Listen address                                       |
| `MAGGIE_BEADS_DIR` | `.`     | Working dir containing `.beads/`                     |
| `MAGGIE_BD_BIN`    | `bd`    | Path to the `bd` binary                              |
| `MAGGIE_ACTORS`    | —       | Comma-separated identity roster for the edit picker  |
| `GITHUB_ORG`       | —       | Source the roster from a GitHub org's members        |
| `GITHUB_TOKEN`     | —       | PAT with `read:org`; needed for private membership   |

Edits are attributed with `bd --actor`. maggie has no login, so the identity is
self-asserted: pick one from the roster or type it in. With neither
`MAGGIE_ACTORS` nor `GITHUB_ORG` set, the roster is empty and users type a name.

## Endpoints

- `GET /` — SPA (table / board / graph)
- `GET /api/issues?status=&priority=&limit=&all=` — list issues
- `GET /api/ready` — ready-to-work issues
- `GET /api/issue?id=<id>` — issue detail
- `GET /api/graph` — dependency edges (JSON), rendered client-side

## Docker (portable maggie + dolt stack)

Packages maggie, `bd`, and `dolt` into one image; compose runs a dolt server plus the maggie web UI.

```bash
# 1. drop a snapshot of the source-of-truth jsonl
mkdir -p snapshot
cp /path/to/your/repo/.beads/issues.jsonl snapshot/issues.jsonl

# 2. build + seed + run
make docker-build
make docker-seed     # import snapshot -> dolt volume
make docker-up       # http://localhost:8088

# later: refresh the data from a fresh snapshot
cp .../issues.jsonl snapshot/issues.jsonl
make docker-refresh  # stop dolt -> re-seed -> start dolt
```

Image versions are pinned via build args (`BD_VERSION`, `DOLT_VERSION`, `GO_VERSION`) in the `Dockerfile`.

> **Security:** maggie has no built-in auth and the compose file publishes
> `:8088`. Front it with a VPN or an authenticating reverse proxy, and keep the
> dolt port (`3307`) internal — never publish it.

## License

Maggie is licensed under the [GNU Affero General Public License v3.0 (AGPLv3)](LICENSE) license.
