package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// OperatorStore is the slice of AdminUserService the middleware needs (interface
// for testability; *service.AdminUserService satisfies it).
type OperatorStore interface {
	GetByID(ctx context.Context, id string) (service.AdminUser, error)
}

// AdminJWT is the operator-auth middleware. It accepts ONLY a Bearer admin JWT,
// re-checks the operator is ACTIVE on every request, and attaches the principal
// to the context. It explicitly rejects the legacy ADMIN_API_KEY / X-Admin-Key.
func AdminJWT(secret string, users OperatorStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Legacy key is no longer a valid credential for the portal.
			if r.Header.Get("X-Admin-Key") != "" {
				deny(w, http.StatusUnauthorized, "UNAUTHORIZED", "admin API key is no longer accepted; sign in as an operator")
				return
			}
			tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
			if !ok || tok == "" {
				deny(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing operator token")
				return
			}
			if secret == "" || users == nil {
				deny(w, http.StatusServiceUnavailable, "UNAVAILABLE", "operator authentication is not configured")
				return
			}
			p, err := auth.Parse(secret, tok)
			if err != nil {
				deny(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired token")
				return
			}
			u, err := users.GetByID(r.Context(), p.ID)
			if err != nil {
				deny(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired token")
				return
			}
			if u.Status != "ACTIVE" {
				deny(w, http.StatusForbidden, "FORBIDDEN", "account suspended")
				return
			}
			ctx := auth.WithPrincipal(r.Context(), auth.Principal{ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func deny(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":{"code":"` + code + `","message":"` + message + `"}}`))
}
