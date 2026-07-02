# Build context contains common/ + developer-api/ as siblings (see deploy.sh
# deploy_developer_api) so the shared modules (replace ../common/obs and
# ../common/email) resolve in Docker.

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

WORKDIR /app
COPY common/ ./common/
COPY developer-api/ ./developer-api/

WORKDIR /app/developer-api
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /app/bin/developer-api ./cmd/developer-api

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM alpine:3.21 AS runtime

RUN apk --no-cache add ca-certificates curl

COPY --from=builder /app/bin/developer-api /usr/local/bin/developer-api

EXPOSE 8086

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
    CMD curl -fsS http://localhost:8086/health || exit 1

CMD ["developer-api"]
