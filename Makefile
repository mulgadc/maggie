.PHONY: ui build run dev fix preflight

# Build the React frontend into the embedded web dir.
ui:
	cd frontend && pnpm install && pnpm build

# Build the Go binary (embeds whatever is in cmd/waratah/web).
build:
	go build -o waratah ./cmd/waratah

# Build everything from clean.
all: ui build

# Run the server against a beads working dir (default: mulga).
run: build
	WARATAH_BEADS_DIR=$${WARATAH_BEADS_DIR:-$$HOME/Development/mulga} ./waratah

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
