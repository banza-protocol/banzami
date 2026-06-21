# Banzami official website (apps/website) — Next.js standalone.
# Public marketing/institutional site. Makes NO calls to the payment runtime;
# it is fully isolated from core/api and the Go payment services.

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
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S banzami && adduser -S banzami -G banzami

# Next.js standalone output: a self-contained server.js + minimal node_modules.
COPY --from=builder --chown=banzami:banzami /app/.next/standalone ./
COPY --from=builder --chown=banzami:banzami /app/.next/static ./.next/static
COPY --from=builder --chown=banzami:banzami /app/public ./public

USER banzami

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
