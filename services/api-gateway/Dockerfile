# Build context contains common/ + api-gateway/ as siblings (see deploy.sh
# deploy_api_gateway) so the shared Document Engine module
# (replace ../common/documents) resolves in Docker.

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM golang:1.26-alpine AS builder

WORKDIR /app
COPY common/ ./common/
COPY api-gateway/ ./api-gateway/

WORKDIR /app/api-gateway
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /app/bin/api-gateway ./cmd/gateway

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM alpine:3.21 AS runtime

# Chromium for the official Document Engine (server-side PDF generation).
RUN apk --no-cache add ca-certificates curl \
    chromium nss freetype harfbuzz ttf-freefont font-noto
ENV BANZAMI_CHROME_BIN=/usr/bin/chromium-browser

COPY --from=builder /app/bin/api-gateway /usr/local/bin/api-gateway

# Run as an unprivileged user (Assurance RA-024 — container hardening).
RUN addgroup -S banzami && adduser -S -G banzami -H -s /sbin/nologin banzami
USER banzami

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
    CMD curl -fsS http://localhost:8080/health || exit 1

CMD ["api-gateway"]
