package middleware

// Developer-key authentication (ADR-046). A distinct, additive path from the
// merchant/JWT Auth middleware: it authenticates a Console-issued external
// developer key (bz_test_sk_/bz_test_pk_) by delegating to developer-api, and
// enforces SANDBOX + scope. It NEVER accepts a merchant JWT, consumer JWT,
// internal service key, webhook secret, or a bz_live_ key.

import (
	"context"
	"net/http"
	"strings"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// DeveloperPrincipal is the authenticated external developer key context.
type DeveloperPrincipal struct {
	KeyID       string
	Environment string
	WorkspaceID string
	ProjectID   string
	Scopes      []string
}

type devPrincipalKey struct{}

// devKeyAuthorizer is satisfied by *service.DeveloperKeyClient.
type devKeyAuthorizer interface {
	Authorize(ctx context.Context, rawKey string) (*service.DeveloperKeyContext, error)
}

// DeveloperKeyPrefixes are the only accepted external developer key prefixes
// (SANDBOX). bz_live_ is intentionally absent and fails closed.
var DeveloperKeyPrefixes = []string{"bz_test_sk_", "bz_test_pk_"}

func looksLikeDevKey(k string) bool {
	for _, p := range DeveloperKeyPrefixes {
		if strings.HasPrefix(k, p) {
			return true
		}
	}
	return false
}

// DeveloperKeyAuth authenticates a Console-issued developer key. Neutral 401 on
// any failure. On success it stores a DeveloperPrincipal and enforces SANDBOX.
func DeveloperKeyAuth(client devKeyAuthorizer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if client == nil {
				apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "developer key auth unavailable")
				return
			}
			raw := extractDevKey(r)
			// Fail closed: reject bz_live_ and anything not a sandbox dev key
			// BEFORE any network call or business logic.
			if raw == "" || strings.HasPrefix(raw, "bz_live_") || !looksLikeDevKey(raw) {
				apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "a valid Sandbox API key is required")
				return
			}
			kc, err := client.Authorize(r.Context(), raw)
			if err != nil || kc == nil || kc.Environment != "SANDBOX" {
				apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "a valid Sandbox API key is required")
				return
			}
			p := &DeveloperPrincipal{
				KeyID: kc.KeyID, Environment: kc.Environment,
				WorkspaceID: kc.WorkspaceID, ProjectID: kc.ProjectID, Scopes: kc.Scopes,
			}
			ctx := context.WithValue(r.Context(), devPrincipalKey{}, p)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetDeveloperPrincipal returns the authenticated developer principal.
func GetDeveloperPrincipal(ctx context.Context) (*DeveloperPrincipal, bool) {
	p, ok := ctx.Value(devPrincipalKey{}).(*DeveloperPrincipal)
	return p, ok
}

// HasScope reports whether the principal holds the given scope.
func (p *DeveloperPrincipal) HasScope(s string) bool {
	for _, sc := range p.Scopes {
		if sc == s {
			return true
		}
	}
	return false
}

// extractDevKey reads the key from Authorization: Bearer <key> or X-API-Key.
func extractDevKey(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	return strings.TrimSpace(r.Header.Get("X-API-Key"))
}
