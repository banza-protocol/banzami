# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Baked into client bundles at build time (for any client-side reads)
ARG NEXT_PUBLIC_PAY_API_URL=https://api.banzami.org
ENV NEXT_PUBLIC_PAY_API_URL=$NEXT_PUBLIC_PAY_API_URL
RUN npm run build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3003
ENV HOSTNAME=0.0.0.0
# Server-side API URL — use PAY_API_URL (not NEXT_PUBLIC_) so docker-compose
# runtime env vars cannot accidentally override it with a consumer-facing URL.
ENV PAY_API_URL=https://api.banzami.org

RUN addgroup -S banzami && adduser -S banzami -G banzami

COPY --from=builder --chown=banzami:banzami /app/.next/standalone ./
COPY --from=builder --chown=banzami:banzami /app/.next/static ./.next/static
COPY --from=builder --chown=banzami:banzami /app/public ./public

USER banzami

EXPOSE 3003

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3003/ || exit 1

CMD ["node", "server.js"]
