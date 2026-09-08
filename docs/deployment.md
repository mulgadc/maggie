# Deploying maggie for a team

The [README](../README.md) covers the single-user case: mount a `.beads/` directory and go. This document covers the other mode — one Dolt server holding the database, every developer's `bd` connecting to it as a client, and maggie as the web view onto the same server.

Read this end to end before starting. Moving a team onto a shared beads server is a one-way door for the data, and the version-pinning step below is the one that bites hardest if it is skipped.

## How it fits together

```
        dev laptop           dev laptop
         bd client            bd client
              \                 /
               \               /
             dolt sql-server :3307  ────  maggie :8088
              (the database)              (web view)
```

- **`dolt`** serves the MySQL wire protocol on `3307`. Maggie reaches it over the compose network as `dolt:3307`; publishing the port to the host is only needed for external `bd` clients.
- **`bd`** 1.x has a server mode. Point a repo at the Dolt endpoint and it reads and writes the shared database instead of an embedded one.
- The **database name** comes from the issue prefix. Clients target that name explicitly so they attach to it rather than trying to create their own.

Three container roles come out of the same image, selected by the first argument: `dolt` (the server), `seed` (a one-shot importer), and `maggie` (the web UI as a Dolt client). The default role, `local`, is the single-user mode and is not used here.

## Before you start

- **Pin `bd` to one version for everyone.** The stack ships the version in `BD_VERSION` (currently v1.0.5). A server and clients on mismatched `bd` versions cause schema skew and breakage. This is the single biggest adoption risk — confirm `bd version` matches across the team before cutover, not after.
- **Decide on accounts.** Clients connect as a shared least-privilege account (read/write, no `DROP`). `root` stays as break-glass.
- **Enable Docker on boot.** Both services carry `restart: unless-stopped`, so they survive crashes and reboots — but only if the daemon starts on boot: `sudo systemctl enable --now docker`. Note the `unless-stopped` semantics: a manual `docker compose down` or `stop` sticks across a reboot. Only a running stack auto-resumes.

## Security model

- **Transport is not encrypted.** The stable `bd` client does not speak TLS, so TLS is not enabled on Dolt. Run the server on a trusted network and have clients reach it over a VPN, so the tunnel encrypts the wire. **Do not publish `3307` to an untrusted network.**
- **Authentication.** Set `DOLT_PASSWORD` (and optionally `DOLT_USER`, default `beads`). The seed creates the account with that password; clients supply it via `BEADS_DOLT_PASSWORD`. With no password set the account is passwordless, which is for local and development use only.
- **Authorisation.** The shared account is scoped to the beads database with read/write and schema-evolution grants (`SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, EXECUTE, CREATE/ALTER ROUTINE, CREATE TEMPORARY TABLES, LOCK TABLES`) but **no `DROP`**, so a client cannot drop a table or destroy the database. Setting `DOLT_USER=root` instead creates a full-privilege account; keep it out of everyday use.
- **Exposure.** `3307` is internal to the compose network by default. To serve remote clients, layer `docker-compose.publish.yml` and set `DOLT_ADDR` to the interface to bind.
- **Maggie itself has no authentication.** Anyone who can reach `8088` can read and modify every issue. Put it on a trusted network or behind an authenticating reverse proxy.

## One-time server setup

1. **Freeze writes.** Everyone finishes and pushes outstanding beads, then stops touching their local trackers. Merge everything into one authoritative `issues.jsonl` — this is the last export from the pre-server world.

2. Put that file at `./snapshot/issues.jsonl`.

3. Choose credentials and the bind interface:

   ```bash
   export DOLT_PASSWORD='<strong-password>'
   export DOLT_ADDR=0.0.0.0        # interface to publish 3307 on
   ```

4. Build, seed and start:

   ```bash
   make docker-build
   docker compose stop dolt
   docker compose run --rm seed
   docker compose -f docker-compose.yml -f docker-compose.publish.yml up -d
   ```

5. **Verify before announcing.** Check `docker compose logs -f dolt`, load maggie, and connect one `bd` client from another machine.

`docker compose run --rm seed` wipes and re-imports the Dolt volume, so it is the authoritative import. `make docker-refresh` runs the same stop/seed/start cycle for later refreshes.

## Per-developer setup

Each developer, from their checkout:

```bash
export BEADS_DOLT_PASSWORD='<shared-password>'    # add to your shell profile

bd init --backend dolt --server --non-interactive \
  --server-host <server-host> --server-port 3307 \
  --server-user beads \
  --database <prefix> --prefix <prefix>
```

`--database` matters: it pins the client to the existing database instead of letting `bd` try to create one named after the working directory.

Everyone shares one prefix. Beads ids are `<prefix>-<hash>`, unique without per-developer prefixes; ownership is the bead's assignee, not the id.

After connecting, JSONL is export-only. **Do not commit `.beads/issues.jsonl`** — running an embedded backend alongside the server invites split-brain. And keep `bd version` pinned; a mismatch corrupts the shared schema.

### Pointing maggie at the server

Maggie is a `bd` client like any other, so it needs a checkout configured as above. In the compose stack the `maggie` role does this automatically on first start. Standalone, configure a directory with `bd init --server ...` and run:

```bash
BEADS_DOLT_PASSWORD='<shared-password>' MAGGIE_BEADS_DIR=/path/to/that/dir maggie
```

Maggie pins `BEADS_DIR` to `MAGGIE_BEADS_DIR` for every `bd` call, so a stale `BEADS_DIR` in the environment cannot silently redirect it at another tracker.

## Backups

The Dolt volume is the whole database. Back it up off-box — a volume snapshot alone is not enough.

**JSONL to git (simple).** Dolt cannot use GitHub as a remote, but the issue data exports to JSONL, which is git-friendly and is exactly what the seed imports, so it round-trips. Point `./backups` at a clone of a **private** backup repo and run:

```bash
BACKUP_GIT=1 make docker-backup     # export live DB -> ./backups, commit + push
```

Schedule it nightly with cron or a systemd timer. To restore, drop the latest `issues.jsonl` at `snapshot/issues.jsonl` and re-seed. This captures the issues but not Dolt branches or commit history.

**Full fidelity (optional).** For point-in-time Dolt history off-box, use a native Dolt backup target — `dolt backup` supports `aws` (S3), `gs`, `http(s)` and `file` URLs. Add one and `dolt backup sync` on a schedule if you need branch and commit granularity as well as the JSONL snapshots.
