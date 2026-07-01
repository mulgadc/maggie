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

## Security model

- **Transport:** the stable `bd` client does not speak TLS, so we do not enable
  TLS on dolt. The server lives on the LAN and every dev reaches it through the
  VPN, so the tunnel already encrypts the wire. Do **not** publish `3307` to an
  untrusted network.
- **Authn:** set `DOLT_PASSWORD` (and optionally `DOLT_USER`, default `root`).
  The seed creates the account with that password and clients must supply it via
  `BEADS_DOLT_PASSWORD`. With no password set the account is passwordless
  (local/dev only).
- **Exposure:** `3307` is internal to the compose network by default (no host
  bind). To serve remote clients, layer `docker-compose.publish.yml` on the LAN
  server and set `DOLT_ADDR` to the interface to bind (`0.0.0.0` or the LAN IP).

## One-time cutover on the server

1. Put the current authoritative `issues.jsonl` at `./snapshot/issues.jsonl`.
2. Choose credentials and the bind interface:
   ```
   export DOLT_PASSWORD='<strong-password>'
   export DOLT_ADDR=0.0.0.0        # interface to publish 3307 on (VPN-gated LAN)
   ```
3. Build and seed the authoritative data (replaces the volume contents):
   ```
   make docker-build
   docker compose stop dolt
   docker compose run --rm seed
   docker compose -f docker-compose.yml -f docker-compose.publish.yml up -d
   ```
4. Verify: `docker compose logs -f dolt` and hit maggie on `:80`.

`docker compose run --rm seed` wipes and re-imports the dolt volume, so it is the
authoritative import. `make docker-refresh` does the same stop/seed/start cycle
for later refreshes before cutover is final.

## Per-dev config (after cutover)

Each dev, in their beads working dir:

```
export BEADS_DOLT_PASSWORD='<strong-password>'   # add to your shell profile
bd init --backend dolt --server \
  --server-host <server-host> --server-port 3307 \
  --server-user root --prefix mulga
```

Then stop using the local embedded/JSONL backend. Do **not** keep committing
`.beads/issues.jsonl` — with a shared dolt server that is the source of truth and
JSONL becomes export-only. Running both invites split-brain.

## Backups

The dolt volume is the whole database. Dolt is versioned (git-like), so schedule
`dolt backup` or push to a dolt remote rather than relying on volume snapshots
alone. Keep backups off-box.
