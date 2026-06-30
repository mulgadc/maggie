# Waratah

Lightweight web UI for viewing and managing [Beads](https://github.com/steveyegge/beads)
issues. Part of the Mulga stack.

Reads come from the `bd` CLI (`bd ... --json`); writes (later) also go through
`bd` so bead invariants stay intact. See [docs/plan.md](docs/plan.md).

## Run

```bash
# from a directory containing a .beads/ dir, or point at one:
WARATAH_BEADS_DIR=$HOME/Development/mulga go run ./cmd/waratah
# open http://localhost:8088
```

## Config (env)

| Var                 | Default | Description                          |
|---------------------|---------|--------------------------------------|
| `WARATAH_ADDR`      | `:8088` | Listen address                       |
| `WARATAH_BEADS_DIR` | `.`     | Working dir containing `.beads/`     |
| `WARATAH_BD_BIN`    | `bd`    | Path to the `bd` binary              |

## Endpoints

- `GET /` — SPA (board / ready / graph)
- `GET /api/issues?status=&priority=&limit=&all=` — list issues
- `GET /api/ready` — ready-to-work issues
- `GET /api/issue?id=<id>` — issue detail
- `GET /api/graph` — interactive dependency graph (HTML)
