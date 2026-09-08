GO_PROJECT_NAME := maggie
SHELL := /bin/bash

# maggie is its own module and is often checked out inside another workspace
# that does not list it in go.work, which makes every go command fail. Opt out.
export GOWORK := off

VERSION ?= $(shell git describe --tags --always --dirty)
LDFLAGS := -s -w -X main.Version=$(VERSION)

# Quiet-mode filters (active when QUIET=1, set by preflight via recursive make)
# Note: grep pipelines use PIPESTATUS[0] so the exit status of `go test`
# propagates through the filter — otherwise a test failure is swallowed by
# grep's own (success) exit code and preflight prints "passed" on red.
ifdef QUIET
  _Q     = @
  _COVQ  = 2>&1 | { grep -Ev '^\s*(ok|PASS|\?|=== RUN|--- PASS:)\s' | grep -v 'coverage: 0\.0%' || true; }; exit $${PIPESTATUS[0]}
  _RACEQ = 2>&1 | { grep -Ev '^\s*(ok|PASS|\?|=== RUN|--- PASS:)\s' || true; }; exit $${PIPESTATUS[0]}
else
  _Q     =
  _COVQ  =
  _RACEQ =
endif

# Preflight — runs the same checks as GitHub Actions.
preflight:
	@$(MAKE) --no-print-directory QUIET=1 build lint lint-ui test-ui diff-coverage test-race govulncheck
	@echo -e "\n ✅ Preflight passed — safe to commit."

# --- Build ---

# Build the React frontend into the embedded web dir.
build-ui:
	cd frontend && pnpm install && pnpm build

# package main go:embeds cmd/maggie/web, which is generated rather than
# committed, so it must exist before any go command that compiles it — tests
# included, even though they serve their own fs.FS. Run build-ui to refresh it.
ENSURE_UI = @[ -f cmd/maggie/web/index.html ] || $(MAKE) build-ui

build:
	$(ENSURE_UI)
	go build -ldflags "$(LDFLAGS)" -o $(GO_PROJECT_NAME) ./cmd/maggie

# Run the server against a beads working dir (default: the current directory).
run: build
	MAGGIE_BEADS_DIR=$${MAGGIE_BEADS_DIR:-.} ./$(GO_PROJECT_NAME)

# Frontend dev server with API proxy to a running Go backend on :8088.
dev:
	cd frontend && pnpm dev

# --- Checks ---

# Run unit tests
test:
	@echo -e "\n....Running tests for $(GO_PROJECT_NAME)...."
	$(ENSURE_UI)
	go test -timeout 120s ./...

# Run unit tests with coverage profile
COVERPROFILE ?= coverage.out
test-cover:
	@echo -e "\n....Running tests with coverage for $(GO_PROJECT_NAME)...."
	$(ENSURE_UI)
	$(_Q)go test -timeout 120s -coverprofile=$(COVERPROFILE) -covermode=atomic ./... $(_COVQ)
	@scripts/check-coverage.sh $(COVERPROFILE) $(QUIET)

# Run unit tests with race detector
test-race:
	@echo -e "\n....Running tests with race detector for $(GO_PROJECT_NAME)...."
	$(ENSURE_UI)
	$(_Q)go test -race -timeout 300s ./... $(_RACEQ)

# Check that new/changed code meets coverage threshold (runs tests first)
diff-coverage: test-cover
	@QUIET=$(QUIET) scripts/diff-coverage.sh $(COVERPROFILE)

# Lint all Go code via golangci-lint (replaces check-format, vet, gosec, staticcheck)
lint:
	@echo "Running golangci-lint..."
	$(_Q)golangci-lint run ./...
	@echo "  golangci-lint ok"

# Lint and format-check the frontend (oxlint + oxfmt)
lint-ui:
	@echo "Running oxlint..."
	$(_Q)cd frontend && pnpm lint
	@echo "  oxlint ok"

# Frontend unit tests (vitest) with coverage. Only src/lib is in scope; the
# components and routes are covered by the build and by oxlint.
test-ui:
	@echo "Running vitest..."
	$(_Q)cd frontend && pnpm test:coverage
	@echo "  vitest ok"

# Auto-fix all linter issues that have fixers, both sides
fix:
	cd frontend && pnpm fix
	golangci-lint run --fix ./...

# Govulncheck — dependency vulnerability scanning (not covered by golangci-lint)
govulncheck:
	@echo "Running govulncheck..."
	$(_Q)go tool govulncheck ./...
	@echo "  govulncheck ok"

clean:
	rm -f $(COVERPROFILE) $(GO_PROJECT_NAME)

# --- Docker (portable maggie + dolt stack) ---

# Build the shared image (BuildKit), then drop the images it orphaned. The
# BuildKit cache is kept on purpose — it is what makes rebuilds fast.
docker-build:
	docker compose build
	docker image prune -f

# Deeper sweep: also clear the BuildKit build cache (slower next build).
docker-clean:
	docker image prune -f
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

.PHONY: preflight build-ui build run dev test test-cover test-race diff-coverage \
	lint lint-ui test-ui fix govulncheck clean docker-build docker-clean docker-seed \
	docker-up docker-down docker-refresh docker-backup
