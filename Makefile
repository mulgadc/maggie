.PHONY: ui build run dev lint fix preflight docker-build docker-prune docker-clean docker-seed docker-up docker-down docker-refresh docker-backup

# Build the React frontend into the embedded web dir.
ui:
	cd frontend && pnpm install && pnpm build

# Build the Go binary (embeds whatever is in cmd/maggie/web). go:embed fails to
# compile when that dir is absent, so a clean checkout builds the frontend first.
build: cmd/maggie/web/index.html
	go build -o maggie ./cmd/maggie

cmd/maggie/web/index.html:
	$(MAKE) ui

# Build everything from clean.
all: ui build

# Run the server against a beads working dir (default: the current directory).
run: build
	MAGGIE_BEADS_DIR=$${MAGGIE_BEADS_DIR:-.} ./maggie

# Frontend dev server with API proxy to a running Go backend on :8088.
dev:
	cd frontend && pnpm dev

# Lint all Go code via golangci-lint (replaces check-format, vet, gosec, staticcheck)
lint:
	golangci-lint run ./...

# Auto-fix every linter issue that has a fixer, both sides.
fix:
	cd frontend && pnpm fix
	golangci-lint run --fix ./...

# Run the same checks as CI. Coverage gates land with the test suite.
preflight: lint
	cd frontend && pnpm lint
	$(MAKE) build

# --- Docker (portable maggie + dolt stack) ---

# Build the shared image (BuildKit), then drop the layers it orphaned.
docker-build:
	docker compose build
	$(MAKE) docker-prune

# Reclaim disk from dangling images left by rebuilds. The BuildKit build cache
# is kept on purpose — it is what makes rebuilds fast. Run `make docker-clean`
# for a deeper sweep that also clears the build cache.
docker-prune:
	docker image prune -f

# Deeper sweep: also clear the BuildKit build cache (slower next build).
docker-clean: docker-prune
	docker builder prune -f

# Import snapshot/issues.jsonl into the dolt volume (dolt must be stopped).
docker-seed:
	docker compose run --rm seed

# Start dolt + maggie (http://localhost:8088).
docker-up:
	docker compose up -d

docker-down:
	docker compose down

# Export the live DB to ./backups as JSONL (off-box/GitHub backup). Set BACKUP_GIT=1
# to also commit+push if ./backups is a clone of a backup repo. See scripts/backup.sh.
docker-backup:
	./scripts/backup.sh

# Refresh the seeded data from a new snapshot without a full teardown.
docker-refresh:
	docker compose stop dolt
	docker compose run --rm seed
	docker compose start dolt
