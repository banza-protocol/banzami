package middleware

import (
	"context"
	"net/http"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// OperatorStore is the slice of AdminUserService the middleware needs (interface
// for testability; *service.AdminUserService satisfies it).
type OperatorStore interface {
	GetByID(ctx context.Context, id string) (service.AdminUser, error)
}

// AdminJWT is the operator-session middleware.
//
// The session is the HttpOnly __Host- cookie admin-api sets when both factors
// are proven (auth.SessionCookieName) — not an Authorization header. A bearer
// token is not a session any more: none is ever handed to JavaScript, and a
// header nobody can legitimately obtain is only a second door (A6-12).
//
// On every request it re-checks the operator can hold a session and that the
// token_version still matches, then:
//   - refuses a state-changing request without the session's CSRF token;
//   - refuses a session past its absolute lifetime;
//   - slides the idle deadline forward, unless the console marked the request
//     as background polling (A5-08).
//
// It explicitly rejects the legacy ADMIN_API_KEY / X-Admin-Key.
func AdminJWT(secret string, users OperatorStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Legacy key is no longer a valid credential for the portal.
			if r.Header.Get("X-Admin-Key") != "" {
				deny(w, http.StatusUnauthorized, "UNAUTHORIZED", "admin API key is no longer accepted; sign in as an operator")
				return
			}
			c, err := r.Cookie(auth.SessionCookieName)
			if err != nil || c.Value == "" {
				deny(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing operator session")
				return
			}
			if secret == "" || users == nil {
				deny(w, http.StatusServiceUnavailable, "UNAVAILABLE", "operator authentication is not configured")
				return
			}
			// Parse checks the signature and exp. exp IS the idle deadline: only
			// this service moves it, and only when the operator makes a request.
			p, err := auth.Parse(secret, c.Value)
			if err != nil {
				auth.ClearSessionCookies(w)
				deny(w, http.StatusUnauthorized, "UNAUTHORIZED", "session expired, please sign in again")
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
			now := time.Now()
			// The absolute lifetime is re-checked here and not only baked into
			// exp, so a token minted without AuthTime (by a future bug, or before
			// the claim existed) is refused rather than trusted indefinitely.
			if p.AuthTime.IsZero() || !now.Before(p.AuthTime.Add(auth.SessionAbsoluteLifetime)) {
				auth.ClearSessionCookies(w)
				deny(w, http.StatusUnauthorized, "UNAUTHORIZED", "session expired, please sign in again")
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
			// with. Logout, change-password, reset, suspend, a failed-code lockout
			// and "terminate sessions" increment the row's token_version, so a
			// stale token no longer matches.
			if p.TokenVersion != u.TokenVersion {
				auth.ClearSessionCookies(w)
				deny(w, http.StatusUnauthorized, "UNAUTHORIZED", "session expired, please sign in again")
				return
			}
			// Cross-site request forgery. A browser attaches the cookie to any
			// request to this host, including one another page causes; only the
			// console's own script can read the CSRF token to send with it.
			if !safeMethod(r.Method) && !auth.ValidCSRF(secret, p, r.Header.Get(auth.CSRFHeader)) {
				deny(w, http.StatusForbidden, "CSRF_REJECTED", "missing or invalid CSRF token")
				return
			}
			// Identity (full name) and live role come from the database, not the
			// token; token_version is the row's current value.
			principal := auth.Principal{
				ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role, TokenVersion: u.TokenVersion,
				Purpose: auth.PurposeSession, AuthTime: p.AuthTime, SteppedUpAt: p.SteppedUpAt,
			}
			// The idle deadline moves with the operator, not with the badges.
			if r.Header.Get(auth.ActivityHeader) != auth.ActivityPassive {
				if tok, exp, err := auth.IssueSession(secret, principal, now, auth.SessionAbsoluteLifetime); err == nil {
					auth.SetSessionCookies(w, secret, principal, tok, exp, now)
				}
			}
			next.ServeHTTP(w, r.WithContext(auth.WithPrincipal(r.Context(), principal)))
		})
	}
}

func safeMethod(m string) bool {
	return m == http.MethodGet || m == http.MethodHead || m == http.MethodOptions
}

// RequireStepUp guards the highest-risk operator routes (A5-08): creating an
// operator, changing a role, resetting another operator's password or sessions,
// pricing, settlement and payout execution, freezes, credentials.
//
// A session is what someone has who walked past an unlocked laptop or lifted a
// cookie. These actions additionally want a second-factor code proven within
// the last window, at POST /admin/v1/auth/step-up. The console answers
// STEP_UP_REQUIRED by asking for the code and retrying.
//
// Mounted after AdminJWT, which put the principal in the context.
func RequireStepUp(window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := auth.FromContext(r.Context())
			if !ok {
				deny(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthenticated")
				return
			}
			now := time.Now()
			// A proof from the future is a forged or mis-clocked token, not a
			// fresh one; a small skew is tolerated.
			if p.SteppedUpAt.IsZero() || now.Sub(p.SteppedUpAt) > window || p.SteppedUpAt.After(now.Add(30*time.Second)) {
				deny(w, http.StatusForbidden, "STEP_UP_REQUIRED", "confirm this action with a code from your authenticator")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func deny(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":{"code":"` + code + `","message":"` + message + `"}}`))
}
