package middleware

import (
	"net/http"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
)

// RequireCapability is the single authorization gate for the admin-api. It runs
// after AdminJWT (which sets the principal) and allows the request only when the
// operator's role grants cap in the central permission matrix (auth.Can). There
// is no inline "if role == ..." anywhere else — every protected mutation routes
// through this middleware.
func RequireCapability(cap auth.Capability) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := auth.FromContext(r.Context())
			if !ok {
				deny(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthenticated")
				return
			}
			if !auth.Can(p.Role, cap) {
				deny(w, http.StatusForbidden, "FORBIDDEN", "your role is not permitted to perform this action")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
