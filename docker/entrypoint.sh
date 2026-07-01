#!/usr/bin/env bash
# Role dispatch for the maggie image: dolt | seed | maggie (default).
set -euo pipefail

role="${1:-maggie}"

case "$role" in
  dolt)
    # Serve the imported Dolt database. Seed must run at least once first.
    mkdir -p "$DOLT_DATA"
    cd "$DOLT_DATA"
    exec dolt sql-server --host 0.0.0.0 --port "$DOLT_PORT"
    ;;

  seed)
    # One-shot manual import: refresh the Dolt volume from an issues.jsonl
    # snapshot. Run with the dolt service stopped (it locks the data dir).
    : "${SNAPSHOT:?SNAPSHOT path required}"
    [ -f "$SNAPSHOT" ] || { echo "no snapshot at $SNAPSHOT (mount ./snapshot)" >&2; exit 1; }
    work="$(mktemp -d)"
    git -C "$work" init -q
    mkdir -p "$work/.beads"
    # Renumber comment ids to be globally unique. Legacy JSONL (bd 0.x) numbers
    # comments per-issue, so many reuse id 1; bd 1.x's comments table has a single
    # column primary key and rejects the collisions on import.
    jq -cn 'reduce inputs as $iss ({g:0, rows:[]};
      (($iss.comments // []) | length) as $n
      | .g as $base
      | .g += $n
      | .rows += [ if $n > 0
                   then ($iss | .comments = [ range(0;$n) as $k | $iss.comments[$k] | .id = ($base + $k + 1) ])
                   else $iss end ]
    ) | .rows[]' "$SNAPSHOT" > "$work/.beads/issues.jsonl"
    git -C "$work" add -A
    git -C "$work" commit -qm "seed snapshot"
    # bd 1.x imports into a database named after the prefix (here "$BEADS_PREFIX").
    # The maggie client connects to that same database name.
    ( cd "$work" && bd init --backend dolt --from-jsonl --prefix "$BEADS_PREFIX" )
    ( cd "$work" && bd stats | grep -iE 'Total Issues|Open|Closed|Ready' || true )
    # bd 1.x embeds dolt at .beads/embeddeddolt/<db>/.dolt — the embeddeddolt
    # directory is itself the dolt data-dir holding one database per prefix.
    # Serve it directly as $DOLT_DATA so dolt sql-server exposes "$BEADS_PREFIX".
    rm -rf "$DOLT_DATA"
    mkdir -p "$(dirname "$DOLT_DATA")"
    mv "$work/.beads/embeddeddolt" "$DOLT_DATA"
    # The embedded import only grants root@localhost; add a network account so
    # remote bd clients can connect. When DOLT_PASSWORD is set the account
    # requires it (defence-in-depth on top of the VPN); otherwise it stays
    # passwordless for local/dev use.
    #
    # root@% keeps full privileges (break-glass / back-compat). Any other user is
    # the shared dev account and gets a least-privilege grant scoped to the beads
    # database: read/write rows and evolve schema, but NO DROP, so it cannot drop
    # tables or destroy the database.
    duser="${DOLT_USER:-root}"
    if [ "$duser" = "root" ]; then
      grant="GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;"
    else
      grant="GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, EXECUTE, CREATE ROUTINE, ALTER ROUTINE, CREATE TEMPORARY TABLES, LOCK TABLES ON $BEADS_PREFIX.* TO '$duser'@'%';"
    fi
    if [ -n "${DOLT_PASSWORD:-}" ]; then
      create="CREATE USER IF NOT EXISTS '$duser'@'%' IDENTIFIED BY '$DOLT_PASSWORD';"
      note="password set"
    else
      create="CREATE USER IF NOT EXISTS '$duser'@'%';"
      note="no password"
    fi
    ( cd "$DOLT_DATA" && dolt sql -q "$create $grant" )
    echo "seeded $DOLT_DATA/$BEADS_PREFIX from $SNAPSHOT (user $duser, $note)"
    ;;

  maggie)
    # Wait for the dolt server to accept connections; compose depends_on does
    # not guarantee the server is ready, and bd init would fail fast otherwise.
    for _ in $(seq 1 30); do
      if (exec 3<>"/dev/tcp/$DOLT_HOST/$DOLT_PORT") 2>/dev/null; then
        exec 3>&- 3<&-
        break
      fi
      sleep 1
    done
    # Configure a server-mode client pointing at the dolt service, then serve.
    # --prefix targets the database the seed created so bd does not auto-create
    # a stray database named after the working directory.
    # bd reads the dolt password from BEADS_DOLT_PASSWORD; empty means none.
    duser="${DOLT_USER:-root}"
    export BEADS_DOLT_PASSWORD="${DOLT_PASSWORD:-}"
    if [ ! -f "$CLIENT_DIR/.beads/metadata.json" ]; then
      mkdir -p "$CLIENT_DIR"
      git -C "$CLIENT_DIR" init -q
      ( cd "$CLIENT_DIR" && bd init --backend dolt --server \
          --server-host "$DOLT_HOST" --server-port "$DOLT_PORT" \
          --server-user "$duser" --prefix "$BEADS_PREFIX" )
      ( cd "$CLIENT_DIR" && bd dolt set database "$BEADS_PREFIX" )
    fi
    export MAGGIE_BEADS_DIR="$CLIENT_DIR"
    export MAGGIE_BD_BIN=bd
    exec maggie
    ;;

  *)
    exec "$@"
    ;;
esac
