# App Banzami Web (WEB-APP-001). A first-class Consumer client; a thin BFF that
# reaches the Consumer API server-side. No financial credential is baked in.

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
ENV PORT=3007
ENV HOSTNAME=0.0.0.0
# The Consumer API the BFF reaches (server-side only). Overridden per deploy.
ENV CONSUMER_API_BASE=https://sandbox-api.banzami.com/consumer
# SESSION_SECRET is REQUIRED at runtime (the app refuses to seal sessions
# without it in production) and is injected as a deploy secret — never baked.

RUN addgroup -S banzami && adduser -S banzami -G banzami
COPY --from=builder --chown=banzami:banzami /app/.next/standalone ./
COPY --from=builder --chown=banzami:banzami /app/.next/static ./.next/static
COPY --from=builder --chown=banzami:banzami /app/public ./public
USER banzami
EXPOSE 3007
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3007/ || exit 1
CMD ["node", "server.js"]
