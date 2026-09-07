# syntax=docker/dockerfile:1
# =============================================================================
# Banzami immutable migration-runner — multi-stage, ephemeral, one-purpose.
# =============================================================================
# Keeps the VM free of any global Rust/Cargo/SQLx/psql/PostgreSQL install: the
# SQLx CLI is compiled ONLY in the build stage; the runtime image carries only the
# sqlx binary, a pinned PostgreSQL client, and the migration entrypoint.
#
# NO secrets in layers, ARGs, labels or build context. NO host port. The database
# credential reaches the entrypoint ONLY through a read-only mounted file
# (/run/secrets/rt04e_migration_url) — never an env var, argv or build arg.
#
# Base images are pinned by IMMUTABLE DIGEST (tag + @sha256). The digests are the
# content-addressed manifest digests recorded in ./digests.lock; a mutable `latest`
# tag is never used. Re-resolve/verify with ./resolve-digests.sh. See ./README.md.
# -----------------------------------------------------------------------------
ARG RUST_BUILDER=rust:1.88-slim-bookworm@sha256:38bc5a86d998772d4aec2348656ed21438d20fcdce2795b56ca434cf21430d89
ARG RUNTIME_BASE=debian:bookworm-slim@sha256:60eac759739651111db372c07be67863818726f754804b8707c90979bda511df

# ── build stage: compile the SQLx CLI locked to the repo's sqlx = "0.7" line ──
FROM ${RUST_BUILDER} AS build
ARG SQLX_CLI_VERSION=0.8.6
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo install sqlx-cli \
      --version "${SQLX_CLI_VERSION}" \
      --locked \
      --no-default-features \
      --features rustls,postgres

# ── runtime stage: minimal, sqlx binary + pinned psql client, non-root ───────
FROM ${RUNTIME_BASE} AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/cargo/bin/sqlx /usr/local/bin/sqlx
COPY entrypoint.sh /usr/local/bin/rt04e-migration-runner
RUN chmod 0555 /usr/local/bin/rt04e-migration-runner \
 && useradd --system --uid 10001 --no-create-home runner
# revision + digest are injected as immutable image identity by the build pipeline
ARG SOURCE_REVISION=unset
LABEL org.opencontainers.image.title="banzami-migration-runner" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
USER runner
# no EXPOSE — the runner publishes no port and joins only the internal data network
ENTRYPOINT ["/usr/local/bin/rt04e-migration-runner"]
