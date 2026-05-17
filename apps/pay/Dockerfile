# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Baked into client bundles at build time
ARG NEXT_PUBLIC_GATEWAY_URL=https://api.banzami.org
ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL
RUN npm run build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
# Runtime env for server-component reads (same value as the baked build arg)
ENV NEXT_PUBLIC_GATEWAY_URL=https://api.banzami.org

RUN addgroup -S banzami && adduser -S banzami -G banzami

COPY --from=builder --chown=banzami:banzami /app/.next/standalone ./
COPY --from=builder --chown=banzami:banzami /app/.next/static ./.next/static
COPY --from=builder --chown=banzami:banzami /app/public ./public

USER banzami

EXPOSE 3002

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://localhost:3002/ || exit 1

CMD ["node", "server.js"]
