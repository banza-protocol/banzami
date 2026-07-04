# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /app/sandbox-operator ./cmd/sandbox-operator

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM alpine:3.21 AS runtime

RUN apk --no-cache add ca-certificates curl

COPY --from=builder /app/sandbox-operator /usr/local/bin/sandbox-operator

# Run as an unprivileged user (Assurance RA-024 — container hardening).
RUN addgroup -S banzami && adduser -S -G banzami -H -s /sbin/nologin banzami
USER banzami

ENV SANDBOX_OPERATOR_PORT=8085

EXPOSE 8085

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=5 \
    CMD curl -fsS http://localhost:8085/health || exit 1

CMD ["sandbox-operator"]
