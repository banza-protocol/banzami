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
			// A token that only proves a password is not a session.
			//
			// The MFA challenge and enrolment tokens are signed with the same key
			// and carry the same subject, so without this check they would open
			// every operator route — which would make the second factor a screen
			// rather than a control.
			if p.Purpose != auth.PurposeSession {
				deny(w, http.StatusUnauthorized, "MFA_REQUIRED", "second factor required")
				return
			}
			u, err := users.GetByID(r.Context(), p.ID)
			if err != nil {
				deny(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired token")
				return
			}
			// Exactly one status may hold a session. Written as the predicate
			// rather than a literal so a new lifecycle state cannot be added
			// without deciding which side of this line it belongs on.
			if !service.CanHoldSession(u.Status) {
				deny(w, http.StatusForbidden, "FORBIDDEN", "account suspended")
				return
			}
			// Session revocation: the JWT carries the token_version it was minted
			// with. Any change-password / reset / suspend / "terminate sessions"
			// increments the row's token_version, so a stale token no longer matches.
			if p.TokenVersion != u.TokenVersion {
				deny(w, http.StatusUnauthorized, "UNAUTHORIZED", "session expired, please sign in again")
				return
			}
			// Identity (full name) and live role come from the database, not the
			// token; token_version is the row's current value.
			ctx := auth.WithPrincipal(r.Context(), auth.Principal{
				ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role, TokenVersion: u.TokenVersion,
				Purpose: auth.PurposeSession,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func deny(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":{"code":"` + code + `","message":"` + message + `"}}`))
}
