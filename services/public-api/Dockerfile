# Build context contains common/ + public-api/ as siblings (see deploy.sh
# deploy_public_api) so the shared Document Engine module
# (replace ../common/documents) resolves in Docker.

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

WORKDIR /app
COPY common/ ./common/
COPY public-api/ ./public-api/

WORKDIR /app/public-api
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /app/bin/public-api ./cmd/public-api

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM alpine:3.21 AS runtime

# Chromium for the official Document Engine (server-side PDF generation).
RUN apk --no-cache add ca-certificates curl \
    chromium nss freetype harfbuzz ttf-freefont font-noto
ENV BANZAMI_CHROME_BIN=/usr/bin/chromium-browser

COPY --from=builder /app/bin/public-api /usr/local/bin/public-api

# Run as an unprivileged user (Assurance RA-024 — container hardening).
RUN addgroup -S banzami && adduser -S -G banzami -H -s /sbin/nologin banzami
USER banzami

EXPOSE 8083

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
    CMD curl -fsS http://localhost:8083/health || exit 1

CMD ["public-api"]
