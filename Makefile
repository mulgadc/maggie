.PHONY: ui build run dev fix preflight

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
