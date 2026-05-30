package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/banza-protocol/banzami/services/api-gateway/internal/apierror"
)

const (
	idempotencyKeyHeader = "Idempotency-Key"
	idempotencyTTL       = 24 * time.Hour
	idempotencyLockTTL   = 30 * time.Second
)

type cachedResponse struct {
	Status      int    `json:"status"`
	Body        string `json:"body"`
	ContentType string `json:"content_type"`
}

// Idempotency returns middleware that replays cached HTTP responses for requests
// that include an Idempotency-Key header.
//
// The cache key is scoped per merchant, HTTP method, and URL path so the same
// key is safe to reuse across different endpoints or merchants.
//
// Concurrent requests with the same key receive 409 Conflict until the first
// request completes. Only 2xx and 4xx responses are cached — 5xx responses are
// considered transient and must not be replayed.
func Idempotency(rdb *redis.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			idemKey := r.Header.Get(idempotencyKeyHeader)
			if idemKey == "" {
				next.ServeHTTP(w, r)
				return
			}

			principal, ok := GetPrincipal(r.Context())
			if !ok || principal.MerchantID == "" {
				// Without a principal we cannot scope the key; let auth reject the request.
				next.ServeHTTP(w, r)
				return
			}

			cacheKey := idempotencyCacheKey(principal.MerchantID, r.Method, r.URL.Path, idemKey)
			lockKey := "lock:" + cacheKey

			// Fast path: replay a previously cached response without acquiring the lock.
			if replayed := tryReplay(r.Context(), rdb, cacheKey, w); replayed {
				return
			}

			// Slow path: acquire an in-flight lock to prevent concurrent duplicate requests.
			locked, err := acquireIdempotencyLock(r.Context(), rdb, lockKey)
			if err != nil {
				slog.WarnContext(r.Context(), "idempotency lock check failed — passing through",
					"error", err, "key", cacheKey)
				next.ServeHTTP(w, r)
				return
			}
			if !locked {
				apierror.Respond(w, r, http.StatusConflict, "IDEMPOTENCY_CONFLICT",
					"a request with this Idempotency-Key is already in progress — retry after it completes")
				return
			}
			defer releaseIdempotencyLock(r.Context(), rdb, lockKey)

			// Re-check after acquiring the lock: another goroutine may have just written the cache.
			if replayed := tryReplay(r.Context(), rdb, cacheKey, w); replayed {
				return
			}

			// Capture the response so we can cache it after the handler returns.
			rec := &idempotencyRecorder{
				ResponseWriter: w,
				buf:            &bytes.Buffer{},
				status:         http.StatusOK,
			}
			next.ServeHTTP(rec, r)

			if rec.status < 500 {
				storeIdempotencyResponse(r.Context(), rdb, cacheKey, rec)
			}
		})
	}
}

func idempotencyCacheKey(merchantID, method, path, idemKey string) string {
	return fmt.Sprintf("idem:%s:%s:%s:%s", merchantID, method, path, idemKey)
}

func tryReplay(ctx context.Context, rdb *redis.Client, key string, w http.ResponseWriter) bool {
	data, err := rdb.Get(ctx, key).Bytes()
	if err != nil {
		return false
	}

	var cached cachedResponse
	if err := json.Unmarshal(data, &cached); err != nil {
		return false
	}

	w.Header().Set("Content-Type", cached.ContentType)
	w.Header().Set("Idempotency-Replayed", "true")
	w.WriteHeader(cached.Status)
	_, _ = w.Write([]byte(cached.Body))
	return true
}

func storeIdempotencyResponse(ctx context.Context, rdb *redis.Client, key string, rec *idempotencyRecorder) {
	payload, err := json.Marshal(cachedResponse{
		Status:      rec.status,
		Body:        rec.buf.String(),
		ContentType: rec.Header().Get("Content-Type"),
	})
	if err != nil {
		return
	}
	if err := rdb.Set(ctx, key, payload, idempotencyTTL).Err(); err != nil {
		slog.WarnContext(ctx, "idempotency cache write failed", "error", err, "key", key)
	}
}

func acquireIdempotencyLock(ctx context.Context, rdb *redis.Client, key string) (bool, error) {
	ok, err := rdb.SetNX(ctx, key, "1", idempotencyLockTTL).Result()
	if err != nil {
		return false, fmt.Errorf("idempotency lock: %w", err)
	}
	return ok, nil
}

func releaseIdempotencyLock(ctx context.Context, rdb *redis.Client, key string) {
	if err := rdb.Del(ctx, key).Err(); err != nil {
		slog.WarnContext(ctx, "idempotency lock release failed", "error", err, "key", key)
	}
}

// idempotencyRecorder captures the status code and body produced by a handler
// while also forwarding every write to the underlying ResponseWriter so the
// client receives the response in real time.
type idempotencyRecorder struct {
	http.ResponseWriter
	buf    *bytes.Buffer
	status int
}

func (r *idempotencyRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *idempotencyRecorder) Write(b []byte) (int, error) {
	r.buf.Write(b)
	return r.ResponseWriter.Write(b)
}
