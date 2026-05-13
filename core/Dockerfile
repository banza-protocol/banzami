# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM rust:1.82-slim-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace manifests first so Cargo can resolve the dependency graph.
COPY Cargo.toml Cargo.lock ./

# Copy every crate — needed so the workspace compiles as a whole.
COPY types/          ./types/
COPY ledger/         ./ledger/
COPY wallets/        ./wallets/
COPY transactions/   ./transactions/
COPY merchants/      ./merchants/
COPY settlement/     ./settlement/
COPY payouts/        ./payouts/
COPY reconciliation/ ./reconciliation/
COPY compliance/     ./compliance/
COPY risk/           ./risk/
COPY routing/         ./routing/
COPY identity/        ./identity/
COPY consumer-wallets/ ./consumer-wallets/
COPY transfers/       ./transfers/
COPY qr/              ./qr/
COPY payment-links/   ./payment-links/
COPY api/             ./api/

# sqlx validates queries against a real database at compile time.
# SQLX_OFFLINE=true tells it to use the cached metadata in .sqlx/ instead.
# Run `make sqlx-prepare` once and commit the .sqlx/ directory before
# building this image. The build will fail here with a clear error if
# the cache is missing.
ENV SQLX_OFFLINE=true

RUN cargo build --release --bin core-api

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/core-api /usr/local/bin/core-api

EXPOSE 8081

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
    CMD curl -fsS http://localhost:8081/health || exit 1

CMD ["core-api"]
