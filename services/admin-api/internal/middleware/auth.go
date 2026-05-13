package middleware

import (
	"net/http"
	"strings"
)

// AdminAuth enforces that every request carries the correct admin API key.
// The key must be supplied as:
//
//	Authorization: Bearer <key>
//	— or —
//	X-Admin-Key: <key>
//
// Returns 401 Unauthorized on missing or invalid credentials.
func AdminAuth(adminKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := extractKey(r)
			if key == "" || key != adminKey {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":{"code":"UNAUTHORIZED","message":"invalid or missing admin API key"}}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func extractKey(r *http.Request) string {
	if k := r.Header.Get("X-Admin-Key"); k != "" {
		return k
	}
	auth := r.Header.Get("Authorization")
	if after, ok := strings.CutPrefix(auth, "Bearer "); ok {
		return after
	}
	return ""
}
