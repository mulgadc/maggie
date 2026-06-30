#!/usr/bin/env bash
# Seed a throwaway Dolt beads server from a snapshot of issues.jsonl, then run
# dolt sql-server. For evaluating the centralised server + waratah only — this
# is a one-off snapshot, NOT a mirror. The team's git/JSONL workflow is the
# source of truth and is untouched.
#
# Usage:
#   ./beads-server-banksia.sh seed   /path/to/issues.jsonl   # one-time import
#   ./beads-server-banksia.sh serve                          # run sql-server
#
# Env (override as needed):
#   DATA_DIR   server working dir            (default: $HOME/beads-server)
#   BIND_HOST  sql-server listen address     (default: 127.0.0.1)
#   PORT       sql-server port               (default: 3307)
#   PREFIX     beads issue prefix            (default: mulga)
set -euo pipefail

DATA_DIR="${DATA_DIR:-$HOME/beads-server}"
BIND_HOST="${BIND_HOST:-127.0.0.1}"
PORT="${PORT:-3307}"
PREFIX="${PREFIX:-mulga}"
DOLT_DATA="$DATA_DIR/.beads/dolt"

need() { command -v "$1" >/dev/null || { echo "missing: $1" >&2; exit 1; }; }

seed() {
  local jsonl="${1:?usage: seed <issues.jsonl>}"
  [ -f "$jsonl" ] || { echo "no such file: $jsonl" >&2; exit 1; }
  need dolt; need bd; need git
  if [ -e "$DOLT_DATA" ]; then
    echo "refusing to overwrite existing $DOLT_DATA (remove it first)" >&2
    exit 1
  fi
  # bd scopes reads by repo id, so the working dir must be a git repo.
  mkdir -p "$DATA_DIR/.beads"
  git -C "$DATA_DIR" init -q
  git -C "$DATA_DIR" config user.name  "banksia-beads"
  git -C "$DATA_DIR" config user.email "engineering@mulgadc.com"
  cp "$jsonl" "$DATA_DIR/.beads/issues.jsonl"
  git -C "$DATA_DIR" add -A
  git -C "$DATA_DIR" commit -qm "seed snapshot"
  ( cd "$DATA_DIR" && bd init --backend dolt --from-jsonl --prefix "$PREFIX" )
  # Gotcha: --from-jsonl imports into DB "beads" but reads default to
  # "beads_<prefix>". Point reads at the populated DB.
  ( cd "$DATA_DIR" && bd dolt set database beads )
  echo "--- bd stats ---"
  ( cd "$DATA_DIR" && bd stats | grep -iE 'Total Issues|Open|Closed|Ready' )
  echo "seeded: $DOLT_DATA"
}

serve() {
  need dolt
  [ -d "$DOLT_DATA" ] || { echo "not seeded yet — run: $0 seed <issues.jsonl>" >&2; exit 1; }
  echo "dolt sql-server on $BIND_HOST:$PORT (data: $DOLT_DATA)"
  echo "WARNING: firewall port $PORT to the management subnet; do not expose publicly."
  cd "$DOLT_DATA"
  exec dolt sql-server --host "$BIND_HOST" --port "$PORT"
}

case "${1:-}" in
  seed)  shift; seed "$@" ;;
  serve) serve ;;
  *) echo "usage: $0 {seed <issues.jsonl>|serve}" >&2; exit 2 ;;
esac
