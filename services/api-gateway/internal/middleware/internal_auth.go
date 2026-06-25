package middleware

import (
	"crypto/subtle"
	"net/http"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
)

// InternalAuth guards service-to-service /internal endpoints. The caller
// (admin-api) must send the shared secret in the X-Internal-Key header. When no
// key is configured the endpoints are disabled (fail closed) so they can never
// be reached unauthenticated.
func InternalAuth(key string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if key == "" {
				apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "internal API is not configured")
				return
			}
			got := r.Header.Get("X-Internal-Key")
			if subtle.ConstantTimeCompare([]byte(got), []byte(key)) != 1 {
				apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "invalid internal key")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
