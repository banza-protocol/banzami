package middleware

import (
	"crypto/subtle"
	"net/http"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
)

// InternalKey admits a request only with the service credential in
// X-Internal-Key, compared in constant time. An empty expected key admits
// nothing.
func InternalKey(expected string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			got := r.Header.Get("X-Internal-Key")
			if expected == "" || got == "" || subtle.ConstantTimeCompare([]byte(got), []byte(expected)) != 1 {
				apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "internal credential required")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
