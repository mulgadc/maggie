# syntax=docker/dockerfile:1
#
# Single image bundling maggie + bd + dolt. The container's role (dolt server,
# one-shot seed, or maggie web) is chosen by the entrypoint argument so the same
# image backs every compose service and lifts cleanly to another host.

ARG GO_VERSION=1.26
ARG BD_VERSION=v1.0.5
ARG DOLT_VERSION=2.1.10

# --- maggie binary (embeds the prebuilt SPA in cmd/maggie/web) ---
FROM golang:${GO_VERSION}-bookworm AS maggie-build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/maggie ./cmd/maggie

# --- bd CLI, pinned to the version the team runs (steveyegge/beads) ---
FROM golang:${GO_VERSION}-bookworm AS bd-build
ARG BD_VERSION
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential git pkg-config libicu-dev \
 && rm -rf /var/lib/apt/lists/*
ENV CGO_ENABLED=1
RUN go install github.com/steveyegge/beads/cmd/bd@${BD_VERSION}

# --- dolt release binary ---
FROM debian:bookworm-slim AS dolt-fetch
ARG DOLT_VERSION
ADD https://github.com/dolthub/dolt/releases/download/v${DOLT_VERSION}/dolt-linux-amd64.tar.gz /tmp/dolt.tgz
RUN tar -xzf /tmp/dolt.tgz -C /tmp \
 && cp /tmp/dolt-linux-amd64/bin/dolt /usr/local/bin/dolt

# --- runtime ---
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates bash libicu72 jq \
 && rm -rf /var/lib/apt/lists/*
COPY --from=maggie-build /out/maggie         /usr/local/bin/maggie
COPY --from=bd-build     /go/bin/bd          /usr/local/bin/bd
COPY --from=dolt-fetch   /usr/local/bin/dolt /usr/local/bin/dolt
COPY docker/entrypoint.sh                    /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
 && git config --system user.name  banksia-beads \
 && git config --system user.email engineering@mulgadc.com \
 && git config --system --add safe.directory '*'
ENV MAGGIE_ADDR=:8088 \
    DOLT_HOST=dolt \
    DOLT_PORT=3307 \
    BEADS_PREFIX=mulga \
    DOLT_DATA=/data/dolt \
    CLIENT_DIR=/client \
    SNAPSHOT=/snapshot/issues.jsonl
EXPOSE 8088 3307
ENTRYPOINT ["entrypoint.sh"]
CMD ["maggie"]
