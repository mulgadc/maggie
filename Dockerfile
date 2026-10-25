# syntax=docker/dockerfile:1
#
# Single image bundling maggie + bd + dolt. The container's role (dolt server,
# one-shot seed, or maggie web) is chosen by the entrypoint argument so the same
# image backs every compose service and lifts cleanly to another host.

ARG BD_VERSION=v1.3.1
ARG DOLT_VERSION=2.1.10

# Base images are pinned by digest so a rebuild of the same commit gets the
# same bytes. Dependabot moves the digests; the golang and node versions are
# held on purpose (see .github/dependabot.yml).

# --- frontend bundle ---
# cmd/maggie/web is generated and not committed, so the image builds it rather
# than depending on one a local `make build-ui` happened to leave behind.
FROM node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 AS ui-build
WORKDIR /src/frontend
RUN corepack enable
# Dependencies first: the lockfile changes far less often than the sources, so
# this layer survives most rebuilds.
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store \
 && pnpm install --frozen-lockfile
COPY frontend/ ./
# vite writes to ../cmd/maggie/web, so the bundle lands at /src/cmd/maggie/web.
RUN pnpm build

# --- maggie binary (go:embeds the bundle built above) ---
FROM golang:1.27.3-bookworm@sha256:972b4110ba0f47539a975c31e52c64765e1ff19f2d74469ae4a595c6676e80a5 AS maggie-build
ARG MAGGIE_VERSION=dev
WORKDIR /src
COPY go.mod go.sum* ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download
COPY . .
COPY --from=ui-build /src/cmd/maggie/web ./cmd/maggie/web
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.Version=${MAGGIE_VERSION}" -o /out/maggie ./cmd/maggie

# --- bd release binary, pinned to the version the team runs (steveyegge/beads) ---
# Compiling bd from source with CGO cost about three minutes of every build.
FROM debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8 AS bd-fetch
ARG BD_VERSION
ADD https://github.com/steveyegge/beads/releases/download/${BD_VERSION}/beads_${BD_VERSION#v}_linux_amd64.tar.gz /tmp/
ADD https://github.com/steveyegge/beads/releases/download/${BD_VERSION}/checksums.txt /tmp/
RUN cd /tmp \
 && sha256sum -c --ignore-missing --strict checksums.txt \
 && tar -xzf beads_${BD_VERSION#v}_linux_amd64.tar.gz bd \
 && cp bd /usr/local/bin/bd

# --- dolt release binary ---
FROM debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8 AS dolt-fetch
ARG DOLT_VERSION
ADD https://github.com/dolthub/dolt/releases/download/v${DOLT_VERSION}/dolt-linux-amd64.tar.gz /tmp/dolt.tgz
RUN tar -xzf /tmp/dolt.tgz -C /tmp \
 && cp /tmp/dolt-linux-amd64/bin/dolt /usr/local/bin/dolt

# --- runtime ---
FROM debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8
ARG MAGGIE_VERSION=dev
# image.source is what makes GHCR attach the package to the repo, so it appears
# under Packages there and inherits the repo's README and visibility settings.
LABEL org.opencontainers.image.source="https://github.com/mulgadc/maggie" \
      org.opencontainers.image.url="https://github.com/mulgadc/maggie" \
      org.opencontainers.image.title="maggie" \
      org.opencontainers.image.description="A fast web UI for Beads issue tracking." \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.version="${MAGGIE_VERSION}"
# Cache mounts hold apt state outside the image, so the lists never land in the
# final layer and stay slim without an explicit cleanup.
RUN rm -f /etc/apt/apt.conf.d/docker-clean
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates bash libicu72 jq
COPY --from=maggie-build /out/maggie         /usr/local/bin/maggie
COPY --from=bd-fetch     /usr/local/bin/bd   /usr/local/bin/bd
COPY --from=dolt-fetch   /usr/local/bin/dolt /usr/local/bin/dolt
COPY docker/entrypoint.sh                    /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
 && git config --system user.name  maggie \
 && git config --system user.email maggie@localhost \
 && git config --system --add safe.directory '*'
ENV MAGGIE_ADDR=:8088 \
    MAGGIE_BEADS_DIR=/repo \
    DOLT_HOST=dolt \
    DOLT_PORT=3307 \
    BEADS_PREFIX=beads \
    DOLT_DATA=/data/dolt \
    CLIENT_DIR=/client \
    SNAPSHOT=/snapshot/issues.jsonl
EXPOSE 8088 3307
ENTRYPOINT ["entrypoint.sh"]
# Default to serving a .beads directory mounted at /repo. The compose stack
# overrides this with the dolt/seed/maggie roles for the shared-server setup.
CMD ["local"]
