package accountidentity

import (
	"context"
	"net/http"

	"github.com/banzami/banzami/services/developer-api/internal/httpx"
)

type ctxKey int

const userCtxKey ctxKey = 0

// UserFrom returns the authenticated user placed in the context by RequireAuth.
func UserFrom(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(userCtxKey).(User)
	return u, ok
}

// RequireAuth is the session guard for authenticated routes: it validates the
// host-only session cookie and injects the user into the request context, or
// returns 401. State-changing authenticated routes must additionally enforce
// Origin + CSRF (see Handlers).
func (h *Handlers) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, err := h.svc.ValidateSession(r.Context(), h.rawSession(r))
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "not authenticated")
			return
		}
		ctx := context.WithValue(r.Context(), userCtxKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// EnforceCSRF wraps a state-changing authenticated handler with Origin + CSRF
// checks (for future workspace/project/key mutations).
func (h *Handlers) EnforceCSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !h.originOK(r) {
			httpx.Error(w, http.StatusForbidden, "FORBIDDEN_ORIGIN", "origin not allowed")
			return
		}
		if !h.svc.ValidateCSRF(h.rawSession(r), r.Header.Get("X-CSRF-Token")) {
			httpx.Error(w, http.StatusForbidden, "CSRF", "missing or invalid CSRF token")
			return
		}
		next.ServeHTTP(w, r)
	})
}
