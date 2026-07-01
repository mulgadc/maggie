# Beads DB cutover — running dolt as the team source of truth

maggie's compose stack bundles three roles from one image: a **dolt** sql-server
(the database), the **maggie** web viewer, and a one-shot **seed** importer.
Today the dolt volume holds a point-in-time snapshot. This document covers
promoting that dolt server to the live, shared beads backend that every dev's
`bd` points at.

## How it fits together

- `dolt` serves the MySQL wire protocol on `3307`. maggie reaches it over the
  compose network (`dolt:3307`); publishing the port is only needed for external
  `bd` clients.
- `bd` 1.x has a server mode (`--server --server-host --server-port
  --server-user`, password via `BEADS_DOLT_PASSWORD`). Point a repo at the dolt
  endpoint and it reads/writes the shared database instead of an embedded one.
- The database is named after the prefix (`mulga`). Clients target that name.

## Prerequisites (team adoption)

- **Pin bd to the image version for everyone.** The stack ships bd `v1.0.5`
  (see `BD_VERSION` in the Dockerfile). A dolt server + clients on mismatched bd
  versions cause schema skew and breakage — this is the biggest adoption risk.
  Confirm every dev runs the same `bd version` before cutover.
- **Non-root account.** Devs connect as the shared `beads` user (read/write, no
  DROP). `root` stays break-glass. See the authz note below.
- **Roster token (optional).** Org membership is private by default, so the
  unauthenticated GitHub API returns an empty member list even for a public org.
  Without `GITHUB_TOKEN` maggie falls back to its built-in static roster (fine for
  a small, stable team). Set a read:org `GITHUB_TOKEN` only if you want the picker
  to track the org automatically.
- **Authoring standard.** New beads follow `docs/beads-authoring.md` (fields +
  label taxonomy). Move that guide into `mulga/.claude/` at cutover.
- **Boot persistence.** Both services carry `restart: unless-stopped`, so they
  survive crashes and host reboots — but only if the Docker daemon starts on
  boot. Enable it on the server: `sudo systemctl enable --now docker`. Note the
  `unless-stopped` semantics: a manual `docker compose down`/`stop` sticks across
  a reboot (containers stay down until you `up -d` again); only a running stack
  auto-resumes.

## Security model

- **Transport:** the stable `bd` client does not speak TLS, so we do not enable
  TLS on dolt. The server lives on the LAN and every dev reaches it through the
  VPN, so the tunnel already encrypts the wire. Do **not** publish `3307` to an
  untrusted network.
- **Authn:** set `DOLT_PASSWORD` (and optionally `DOLT_USER`, default `beads`).
  The seed creates the account with that password and clients must supply it via
  `BEADS_DOLT_PASSWORD`. With no password set the account is passwordless
  (local/dev only).
- **Authz:** `beads` is the shared dev account. It is scoped to the beads
  database with read/write and schema-evolution grants (`SELECT, INSERT, UPDATE,
  DELETE, CREATE, ALTER, INDEX, REFERENCES, EXECUTE, CREATE/ALTER ROUTINE,
  CREATE TEMPORARY TABLES, LOCK TABLES`) but **no `DROP`**, so a dev cannot drop
  a table or destroy the database. `root@%` is a full-privilege break-glass
  account created only when `DOLT_USER=root`; keep it out of everyday use.
- **Exposure:** `3307` is internal to the compose network by default (no host
  bind). To serve remote clients, layer `docker-compose.publish.yml` on the LAN
  server and set `DOLT_ADDR` to the interface to bind (`0.0.0.0` or the LAN IP).

## One-time cutover on the server (e.g. banksia)

0. **Freeze writes.** Every dev finishes and pushes outstanding beads, then stops
   touching their local beads. Merge everything into one authoritative
   `issues.jsonl` — this is the last export from the JSONL world.
1. Put that authoritative `issues.jsonl` at `./snapshot/issues.jsonl`.
2. Choose credentials, roster token, and the bind interface:
   ```
   export DOLT_PASSWORD='<strong-password>'
   export GITHUB_TOKEN='<read:org PAT>'   # roster of org members for edits
   export DOLT_ADDR=0.0.0.0               # interface to publish 3307 on (VPN-gated LAN)
   ```
3. Build and seed the authoritative data (replaces the volume contents):
   ```
   make docker-build
   docker compose stop dolt
   docker compose run --rm seed
   docker compose -f docker-compose.yml -f docker-compose.publish.yml up -d
   ```
4. Verify: `docker compose logs -f dolt`, hit maggie on `:80`, and do one test
   `bd` connect from a dev box over `banksia:3307` before announcing.

`docker compose run --rm seed` wipes and re-imports the dolt volume, so it is the
authoritative import. `make docker-refresh` does the same stop/seed/start cycle
for later refreshes before cutover is final.

## Per-dev config (after cutover)

Each dev, in their beads working dir. Use **your own prefix** (the shared db is
`mulga`; the prefix only sets the ids of beads *you* create — e.g. `mulga-siv`,
`mulga-js`, `mulga-bm`, `mulga-tn`):

```
export BEADS_DOLT_PASSWORD='<strong-password>'   # add to your shell profile
bd init --backend dolt --server \
  --server-host banksia --server-port 3307 \
  --server-user beads --prefix <your-prefix>
bd dolt set database mulga
```

Then stop using the local embedded/JSONL backend. Do **not** keep committing
`.beads/issues.jsonl` — with a shared dolt server that is the source of truth
JSONL becomes export-only. Running both invites split-brain. Confirm your
`bd version` matches the server's (`v1.0.5`) first.

## Backups

The dolt volume is the whole database — back it up off-box, not just as a volume
snapshot.

**GitHub (recommended, simple).** Dolt cannot use GitHub as a remote (dolt is not
a git format), but the issue data exports to JSONL, which *is* git-friendly and is
exactly what the seed imports — so a JSONL backup round-trips. Point `./backups`
at a clone of a **private** backup repo (deploy key or token) and run:

```
BACKUP_GIT=1 make docker-backup      # export live DB -> ./backups, commit + push
```

Schedule it (cron or a systemd timer) nightly on the server. To restore, drop the
latest `issues.jsonl` at `snapshot/issues.jsonl` and re-seed. This captures the
issues but not dolt branches/commit history.

**Full-fidelity (optional).** For point-in-time dolt history off-box, use a native
dolt backup target — `dolt backup` supports `aws` (S3), `gs`, `http(s)`, and
`file` URLs (not GitHub). Add one and `dolt backup sync` on a schedule if you need
branch/commit granularity in addition to the JSONL snapshots.
