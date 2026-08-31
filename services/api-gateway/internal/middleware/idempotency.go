package middleware

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
)

// maxIdempotentBody bounds the request body buffered for fingerprinting.
const maxIdempotentBody = 1 << 20

const (
	idempotencyKeyHeader = "Idempotency-Key"
	idempotencyTTL       = 24 * time.Hour
	idempotencyLockTTL   = 30 * time.Second
)

type cachedResponse struct {
	Status      int    `json:"status"`
	Body        string `json:"body"`
	ContentType string `json:"content_type"` // Fingerprint of the request that produced this response. Empty on entries
	// written before RA-044; those replay as before rather than failing a rollout.
	Fingerprint string `json:"fingerprint,omitempty"`
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

			// Scope the idempotency key to the authenticated tenant. A merchant JWT
			// scopes by merchant id; a developer key scopes by its non-secret key id
			// (ADR-047 dual-credential routes). Without either we cannot scope it —
			// let auth reject the request.
			var scope string
			if principal, ok := GetPrincipal(r.Context()); ok && principal.MerchantID != "" {
				scope = "m:" + principal.MerchantID
			} else if dp, ok := GetDeveloperPrincipal(r.Context()); ok && dp.KeyID != "" {
				scope = "dk:" + dp.KeyID
			} else {
				next.ServeHTTP(w, r)
				return
			}

			cacheKey := idempotencyCacheKey(scope, r.Method, r.URL.Path, idemKey)
			lockKey := "lock:" + cacheKey

			// Fingerprint the request so a reused key can be checked against the
			// operation it originally identified. Without this the cached response
			// was replayed for ANY payload, so reusing a key with a different
			// amount returned the original session with 201 and the caller believed
			// the new amount had been accepted (RA-044). An idempotency key
			// identifies one logical request, not whatever request reuses the
			// string.
			bodyBytes, readErr := io.ReadAll(io.LimitReader(r.Body, maxIdempotentBody))
			if readErr != nil {
				apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "could not read request body")
				return
			}
			_ = r.Body.Close()
			r.Body = io.NopCloser(bytes.NewReader(bodyBytes))
			fingerprint := requestFingerprint(bodyBytes)

			// Fast path: replay a previously cached response without acquiring the lock.
			if replayed, conflict := tryReplay(r.Context(), rdb, cacheKey, w, fingerprint); conflict {
				apierror.Respond(w, r, http.StatusConflict, "IDEMPOTENCY_KEY_REUSED",
					"this Idempotency-Key was already used for a different request")
				return
			} else if replayed {
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
			if replayed, conflict := tryReplay(r.Context(), rdb, cacheKey, w, fingerprint); conflict {
				apierror.Respond(w, r, http.StatusConflict, "IDEMPOTENCY_KEY_REUSED",
					"this Idempotency-Key was already used for a different request")
				return
			} else if replayed {
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
				storeIdempotencyResponse(r.Context(), rdb, cacheKey, rec, fingerprint)
			}
		})
	}
}

func idempotencyCacheKey(merchantID, method, path, idemKey string) string {
	return fmt.Sprintf("idem:%s:%s:%s:%s", merchantID, method, path, idemKey)
}

// requestFingerprint canonicalises the body so that formatting noise — key order,
// whitespace, an explicitly empty field — does not read as a different request,
// while any change to a value does.
//
// Known limit, stated rather than hidden: this is transport-level canonicalisation.
// It cannot know an endpoint's SEMANTIC defaults, so omitting a field and sending
// that field's default value explicitly fingerprint differently and will conflict.
// That direction is the safe one — a false conflict refuses the request, where a
// missed conflict would silently return the wrong resource — but it is a real
// limitation, not an accident.
func requestFingerprint(body []byte) string {
	if len(body) == 0 {
		return "sha256:empty"
	}
	var v any
	if err := json.Unmarshal(body, &v); err != nil {
		// Not JSON: hash the bytes as-is rather than guessing at structure.
		sum := sha256.Sum256(body)
		return "sha256:" + hex.EncodeToString(sum[:])
	}
	canonical, err := json.Marshal(canonicaliseJSON(v))
	if err != nil {
		sum := sha256.Sum256(body)
		return "sha256:" + hex.EncodeToString(sum[:])
	}
	sum := sha256.Sum256(canonical)
	return "sha256:" + hex.EncodeToString(sum[:])
}

// canonicaliseJSON drops null and empty-string members so an explicitly-empty
// optional field is equivalent to omitting it. Go's encoding/json already
// marshals object keys in sorted order, which handles key ordering.
func canonicaliseJSON(v any) any {
	switch t := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			if val == nil {
				continue
			}
			if s, ok := val.(string); ok && s == "" {
				continue
			}
			out[k] = canonicaliseJSON(val)
		}
		return out
	case []any:
		out := make([]any, 0, len(t))
		for _, val := range t {
			out = append(out, canonicaliseJSON(val))
		}
		return out
	default:
		return v
	}
}

// tryReplay returns (replayed, conflict). A cached entry whose fingerprint does
// not match the incoming request is a conflict, never a replay.
func tryReplay(ctx context.Context, rdb *redis.Client, key string, w http.ResponseWriter, fingerprint string) (bool, bool) {
	data, err := rdb.Get(ctx, key).Bytes()
	if err != nil {
		return false, false
	}

	var cached cachedResponse
	if err := json.Unmarshal(data, &cached); err != nil {
		return false, false
	}

	// Entries written before fingerprinting existed carry none; replaying them is
	// the previous behaviour and is preferable to rejecting in-flight keys during
	// a rollout.
	if cached.Fingerprint != "" && cached.Fingerprint != fingerprint {
		return false, true
	}

	w.Header().Set("Content-Type", cached.ContentType)
	w.Header().Set("Idempotency-Replayed", "true")
	w.WriteHeader(cached.Status)
	_, _ = w.Write([]byte(cached.Body))
	return true, false
}

func storeIdempotencyResponse(ctx context.Context, rdb *redis.Client, key string, rec *idempotencyRecorder, fingerprint string) {
	payload, err := json.Marshal(cachedResponse{
		Status:      rec.status,
		Body:        rec.buf.String(),
		ContentType: rec.Header().Get("Content-Type"),
		Fingerprint: fingerprint,
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
