# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

RUN addgroup -S banzami && adduser -S banzami -G banzami

COPY --from=builder --chown=banzami:banzami /app/.next/standalone ./
COPY --from=builder --chown=banzami:banzami /app/.next/static ./.next/static
# The brand icons. Next's standalone output does NOT include public/, so an
# asset that exists in the repo and is referenced by metadata would 404 in the
# image while working perfectly in `next dev` — the same shape of gap that makes
# a file added to the tree but not to the image silently disappear. website and
# pay both copy it; admin had no public/ at all until the icons arrived.
COPY --from=builder --chown=banzami:banzami /app/public ./public

USER banzami

EXPOSE 3002

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3002/ || exit 1

CMD ["node", "server.js"]
