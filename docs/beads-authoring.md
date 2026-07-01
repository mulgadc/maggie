# Bead authoring guide (for Claude and devs)

How to create and maintain beads so the tracker stays useful: every bead
searchable, prioritised, and grouped by area. Today most beads carry no labels
and no acceptance criteria — this guide fixes that going forward.

> **Location note:** this lives in the maggie repo for now. At dolt cutover it
> moves to `mulga/.claude/` (as `beads-authoring.md` with a mandatory pointer in
> `mulga/.claude/CLAUDE.md`) so Claude applies it on every bead operation.

## Apply this on every `bd create` and `bd update`

Populate **all** relevant fields at creation — do not create a bare title and
backfill later. A good bead answers: what, why, when is it done, where it fits.

### Required on every create

- **title** — imperative and specific. `Fix ELBv2 target group draining on scale-in`, not `elbv2 bug`.
- **description** — why the bead exists and what to do. Add context; for bugs include repro + expected vs actual. Never just restate the title.
- **type** — `bug | feature | task | epic | chore | decision`.
- **priority** — `0`–`4` (see below). Default `2`.
- **≥1 area label** — see taxonomy. This is what powers the dashboard "by area" view and filtering.

### Required for `bug` and `feature`

- **acceptance criteria** (`--acceptance`) — concrete, checkable done conditions.
  `Draining connections complete before target deregistered; no 5xx during scale-in.`

### Wire when known

- **dependencies** (`--deps`) — `blocks:`, `parent:`/`--parent`, `relates-to:`, `discovered-from:`.
- **assignee** (`-a`) — a GitHub username from the roster when a bead is owned.

## Field rules

| Field | Rule |
|---|---|
| title | ≤ ~70 chars, imperative, unique enough to scan |
| description | context + task; bugs get repro/expected/actual; link plan docs by path, not bead ids in comments |
| type | pick the narrowest true type; `epic` only for a parent tracking children |
| priority | 0 critical (prod down / data loss), 1 high (blocks others / soon), 2 normal (default), 3 low, 4 backlog |
| acceptance | mandatory for bug/feature; bullet or one-line testable conditions |
| labels | ≥1 area; add kind labels when they apply; prefer existing labels |
| assignee | roster GitHub username; leave empty if unclaimed |
| deps | model real blocking/parent/related links so `bd ready` and the graph are correct |

## Label taxonomy

Two axes. **Area** = where the work lives (required, ≥1). **Kind** = the nature
of the work (optional, add when it applies). Labels are flat, lowercase,
hyphenated. Prefer an existing label; create a new **area** label only for a
genuinely new component (align it to a repo dir or a spinifex handler).

### Area — projects

`spinifex` · `predastore` · `viperblock` · `northstar` · `maggie`

### Area — spinifex AWS handlers (`spinifex/spinifex/handlers/`)

`ec2` · `ecr` · `ecs` · `eks` · `elbv2` · `iam` · `imds` · `sts` · `acm` · `quota` · `sysinstance`

### Area — infra & services

`nats` · `awsgw` · `ovn` · `network` · `dolt` · `beads` · `ci`

### Kind

`needs-triage` · `silent-failure` · `footgun` · `tech-debt` · `refactor` ·
`aws-compat` · `security` · `performance` · `observability` · `ha` · `teardown` ·
`docs` · `test`

**Creating new labels:** allowed, but deliberate. Reuse before inventing. A new
area label should map to a real component (a repo or `handlers/<x>` dir); a new
kind label should name a recurring cross-cutting concern, not a one-off. Avoid
near-duplicates (`network`/`networking`, `related`/`relates-to`).

## Create templates

```bash
# bug
bd create "Fix ELBv2 target draining on scale-in" \
  -t bug -p 1 \
  -d "On scale-in, targets deregister before connections drain, causing 5xx. Repro: scale an ASG down under load. Expected: graceful drain; Actual: reset connections." \
  --acceptance "Connections drain to completion before deregistration; no 5xx during scale-in; covered by a test." \
  -l elbv2,aws-compat \
  -a joshsiv-mulga

# feature
bd create "Add IMDSv2 hop-limit enforcement" \
  -t feature -p 2 \
  -d "..." --acceptance "..." \
  -l imds,security

# task under an epic, with a blocker
bd create "Wire eks node draining into teardown" \
  -t task -p 2 -d "..." \
  -l eks,teardown \
  --parent mulga-cs-eks-6d --deps blocks:mulga-siv-231
```

Add `--validate` to have bd check the description has the required sections for
the type. Use `--dry-run` to preview a create.

## Lifecycle

- Claim before coding: `bd update <id> --claim` (sets assignee + `in_progress`).
- Keep status honest: `open` → `in_progress` → `closed`; `blocked` when waiting.
- Close with a reason: `bd close <id> --reason "..."`.
- Never leave a bead in `in_progress` you are not working on.

## Anti-patterns

- Title-only beads with empty description.
- No label (invisible to the "by area" view and area filters).
- `bug`/`feature` with no acceptance criteria.
- Priority left at default when it is clearly critical or backlog.
- Referencing plan docs or bead ids inside code comments (keep those in the bead).
- New label that duplicates an existing one with different spelling.
