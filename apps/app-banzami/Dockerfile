# App Banzami Web (WEB-APP-001). One Flutter Consumer codebase, Web target,
# served behind a same-origin server-mediated session BFF. No financial
# credential is baked in; the Consumer Bearer lives only in the runtime session.
#
# Build context is the REPOSITORY ROOT (the Web target is built from the shared
# Flutter sources under apps/mobile + sdk/flutter):
#   docker build -f apps/app-banzami/Dockerfile -t app-banzami-web .

# ─── Stage 1: Flutter Web build (the shared Consumer app) ─────────────────────
FROM ghcr.io/cirruslabs/flutter:3.44.0 AS webbuild
WORKDIR /src
COPY sdk/flutter ./sdk/flutter
COPY apps/mobile ./apps/mobile
WORKDIR /src/apps/mobile
RUN flutter pub get
# Same-origin BFF path; sandbox badge on. Live vs sandbox is chosen server-side
# by the BFF's CONSUMER_API_BASE, never baked into the client (§82).
RUN flutter build web \
      -t lib/main_consumer_web.dart \
      --no-web-resources-cdn \
      --base-href / \
      --dart-define=PUBLIC_API_URL=/consumer \
      --dart-define=ENVIRONMENT=sandbox \
      --no-wasm-dry-run

# ─── Stage 2: Node BFF runtime ────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3007
ENV HOSTNAME=0.0.0.0
ENV WEB_ROOT=/app/web
# Build identity (passed by the native build as --build-arg BUILD_COMMIT), exposed
# on /healthz for support/version visibility (WEB-APP-001 §57). Not a secret.
ARG BUILD_COMMIT=dev
ENV BANZAMI_BUILD_COMMIT=$BUILD_COMMIT
# The Consumer API the BFF reaches server-side. Overridden per deploy; sandbox
# only for this milestone.
ENV CONSUMER_API_BASE=https://sandbox-api.banzami.com/consumer
# The opaque Web session store. SESSION_REDIS_ADDR (host:port) selects the Redis
# backend (durable across a host restart, safe across replicas); without it the
# host falls back to a single-node file store. SESSION_REDIS_PASSWORD is optional
# (only if the deployed Redis requires AUTH/ACL). Injected per deploy.
ENV SESSION_REDIS_ADDR=
# APP_WEB_SESSION_STORE_KEY encrypts the session record (which holds the upstream
# Consumer Bearer) at rest with AES-256-GCM. REQUIRED in production — the store
# fails closed without it. A DEDICATED secret from canonical secret management:
# never the CSRF secret, the cookie id, or any Consumer/Project credential; never
# shipped to the browser; never logged; never baked. Injected at runtime
# (--env-file), not declared as an ENV here, so no secret-shaped ENV is in the image.

RUN addgroup -S banzami && adduser -S banzami -G banzami
# The host is pure Node built-ins — no npm dependencies to install.
COPY apps/app-banzami/package.json ./package.json
COPY apps/app-banzami/server.mjs ./server.mjs
COPY apps/app-banzami/lib ./lib
COPY apps/app-banzami/scripts ./scripts
COPY --from=webbuild /src/apps/mobile/build/web ./web
# Content-address the font URLs so a byte change (new tree-shaken icon subset) always
# yields a new URL — no browser/CDN can serve a stale font subset after a deploy
# (BUSINESS-WEB-ICON defect fix). Build-time content hash, not a runtime timestamp.
RUN node scripts/content-address-fonts.mjs ./web
# Harden the service worker: purge + unregister any stale offline cache from a
# previous deploy on activate (BUSINESS-WEB-ICON defect, part 2).
RUN node scripts/harden-service-worker.mjs ./web
RUN chown -R banzami:banzami /app
USER banzami
EXPOSE 3007
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3007/healthz || exit 1
CMD ["node", "server.mjs"]
