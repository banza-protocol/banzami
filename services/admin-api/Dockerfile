# Build context is a dir containing `common/` and `admin-api/` as siblings (see
# deploy.sh deploy_admin_api), so the go.mod `replace ../common/documents`
# resolves both locally and in Docker.

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

WORKDIR /app
COPY common/ ./common/
COPY admin-api/ ./admin-api/

WORKDIR /app/admin-api
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /app/bin/admin-api ./cmd/admin

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM alpine:3.21 AS runtime

# Chromium for the official Document Engine (server-side PDF generation).
RUN apk --no-cache add ca-certificates curl \
    chromium nss freetype harfbuzz ttf-freefont font-noto
ENV BANZAMI_CHROME_BIN=/usr/bin/chromium-browser

COPY --from=builder /app/bin/admin-api /usr/local/bin/admin-api

EXPOSE 8082

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
    CMD curl -fsS http://localhost:8082/health || exit 1

CMD ["admin-api"]
