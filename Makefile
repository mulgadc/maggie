.PHONY: ui build run dev fix preflight docker-build docker-prune docker-seed docker-up docker-down docker-refresh

# Build the React frontend into the embedded web dir.
ui:
	cd frontend && pnpm install && pnpm build

# Build the Go binary (embeds whatever is in cmd/maggie/web).
build:
	go build -o maggie ./cmd/maggie

# Build everything from clean.
all: ui build

# Run the server against a beads working dir (default: mulga).
run: build
	MAGGIE_BEADS_DIR=$${MAGGIE_BEADS_DIR:-$$HOME/Development/mulga} ./maggie

# Frontend dev server with API proxy to a running Go backend on :8088.
dev:
	cd frontend && pnpm dev

fix:
	cd frontend && pnpm fix
	go fmt ./...

preflight:
	go vet ./...
	cd frontend && pnpm lint
	go build ./...

# --- Docker (portable maggie + dolt stack) ---

# Build the shared image, then reclaim space from the layers it replaced.
# Force the legacy builder: the host's buildx is too old for this stack.
docker-build:
	DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker compose build
	$(MAKE) docker-prune

# Reclaim disk: drop dangling images and stale build cache left by rebuilds.
docker-prune:
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

# Refresh the seeded data from a new snapshot without a full teardown.
docker-refresh:
	docker compose stop dolt
	docker compose run --rm seed
	docker compose start dolt
