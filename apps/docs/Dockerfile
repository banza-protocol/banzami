# ─── Build context: repo root (/srv/banzami/src/) ─────────────────────────────
# deploy.sh runs:
#   docker build -f /srv/banzami/src/apps/docs/Dockerfile /srv/banzami/src/
#
# This gives the build access to both apps/docs/ and docs/BANZAMI_REFERENCE.md
# which is read at build time by lib/reference.ts (ADR-015 — source of truth).
# All 20 section pages are statically generated at build time; the runtime
# container does NOT need the markdown file.

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY apps/docs/package.json ./
RUN npm install --legacy-peer-deps

COPY apps/docs/ ./

# Place the reference document where lib/reference.ts expects it:
# path.join(process.cwd(), '../../docs/BANZAMI_REFERENCE.md')
# process.cwd() = /app → resolves to /docs/BANZAMI_REFERENCE.md
COPY docs/BANZAMI_REFERENCE.md /docs/BANZAMI_REFERENCE.md

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3005
ENV HOSTNAME=0.0.0.0

RUN addgroup -S banzami && adduser -S banzami -G banzami

# Standalone output bundles everything; static HTML was generated at build time
COPY --from=builder --chown=banzami:banzami /app/.next/standalone ./
COPY --from=builder --chown=banzami:banzami /app/.next/static     ./.next/static

USER banzami

EXPOSE 3005

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=3 \
    CMD wget -qO- http://localhost:3005/ || exit 1

CMD ["node", "server.js"]
