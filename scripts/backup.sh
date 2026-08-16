#!/usr/bin/env bash
# Export the live beads DB to JSONL for off-box backup.
#
# JSONL is the same format the seed imports, so a backup round-trips: to restore,
# drop it at snapshot/issues.jsonl and re-seed. Runs against the live server via
# the maggie client container, so no downtime.
#
# Optional GitHub backup: make ./backups a clone of a private backup repo (deploy
# key or token) and set BACKUP_GIT=1 to commit + push each run. Schedule with cron
# or a systemd timer on the server.
#
#   BACKUP_GIT=1 ./scripts/backup.sh
set -euo pipefail

out="${BACKUP_DIR:-./backups}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$out"

# bd export runs through the configured client and reads the live dolt server.
# The entrypoint exports BEADS_DOLT_PASSWORD into its own process only, so an
# exec'd shell has to take it from the container's DOLT_PASSWORD or bd is denied.
docker compose exec -T maggie sh -c \
	'cd "$CLIENT_DIR" && BEADS_DOLT_PASSWORD="$DOLT_PASSWORD" bd export --all' >"$out/issues-$stamp.jsonl"
cp "$out/issues-$stamp.jsonl" "$out/issues.jsonl"
echo "wrote $out/issues-$stamp.jsonl ($(wc -l <"$out/issues-$stamp.jsonl") issues)"

if [ "${BACKUP_GIT:-0}" = "1" ]; then
	git -C "$out" add -A
	git -C "$out" commit -q -m "backup $stamp" || echo "nothing to commit"
	git -C "$out" push -q
	echo "pushed backups to git remote"
fi
