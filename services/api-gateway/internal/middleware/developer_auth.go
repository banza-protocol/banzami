package middleware

// Developer-key authentication (ADR-046). A distinct, additive path from the
// merchant/JWT Auth middleware: it authenticates a Console-issued external
// developer key (bz_test_sk_/bz_test_pk_) by delegating to developer-api, and
// enforces SANDBOX + scope. It NEVER accepts a merchant JWT, consumer JWT,
// internal service key, webhook secret, or a bz_live_ key.

import (
	"context"
	"errors"
	"fmt"
	"github.com/banzami/banzami/services/common/env"
	"net/http"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// DeveloperPrincipal is the authenticated external developer key context.
// WorkspaceID/ProjectID are internal (tenant enforcement) and MUST NOT be
// serialized to a public response; ProjectSlug + KeyStatus are the safe public
// identity fields.
type DeveloperPrincipal struct {
	KeyID       string
	Environment string
	WorkspaceID string
	ProjectID   string
	ProjectSlug string
	ProjectName string
	KeyStatus   string
	Scopes      []string
	// Sealed: the binding's destination is locked (ADR-055).
	Sealed bool

	// Binding (ADR-047) — the Project's resolved SANDBOX payee, INTERNAL only.
	// Bound=false ⇒ no payment authority even if the key holds payment scopes.
	// The ids derive the payee for Core and MUST NOT be serialized to any payer.
	Bound           bool
	MerchantID      string
	WalletID        string
	WalletAccountID string
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
			p, ok := resolveDeveloperPrincipal(w, r, client)
			if !ok {
				return // resolveDeveloperPrincipal already wrote the response
			}
			ctx := context.WithValue(r.Context(), devPrincipalKey{}, p)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// resolveDeveloperPrincipal runs the full ADR-046 developer-key authorization for
// the presented credential and returns the principal, or writes a fail-closed
// response and returns false. It is the SINGLE source of truth for developer-key
// auth — shared by DeveloperKeyAuth and DualAuth so the two can never diverge.
// The caller MUST have already decided this request is a developer-key attempt
// (see isDeveloperKeyAttempt) so a JWT never reaches here.
func resolveDeveloperPrincipal(w http.ResponseWriter, r *http.Request, client devKeyAuthorizer) (*DeveloperPrincipal, bool) {
	if client == nil {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "developer key auth unavailable")
		return nil, false
	}
	raw := extractDevKey(r)
	// Fail closed: reject bz_live_ and anything not a sandbox dev key BEFORE any
	// network call or business logic.
	if raw == "" || strings.HasPrefix(raw, "bz_live_") || !looksLikeDevKey(raw) {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "a valid Sandbox API key is required")
		return nil, false
	}
	kc, err := client.Authorize(r.Context(), raw)
	// A complete, SANDBOX context is the ONLY success. A dependency fault OR an
	// integrity problem (200 but incomplete/non-SANDBOX payload — a valid key
	// always yields a complete SANDBOX context) is AUTHORIZATION_UNAVAILABLE,
	// never an invalid key.
	unavailable := errors.Is(err, service.ErrAuthorizationUnavailable) ||
		(err == nil && (kc == nil || kc.KeyID == "" || !env.Parse(kc.Environment).IsSandbox()))
	if unavailable {
		w.Header().Set("Retry-After", "2")
		apierror.Respond(w, r, http.StatusServiceUnavailable, "AUTHORIZATION_UNAVAILABLE",
			"authorization is temporarily unavailable — retry shortly")
		return nil, false
	}
	if err != nil {
		// Definitive key rejection (403): missing/invalid/forged/revoked/rotated.
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "a valid Sandbox API key is required")
		return nil, false
	}
	p := &DeveloperPrincipal{
		KeyID: kc.KeyID, Environment: kc.Environment,
		WorkspaceID: kc.WorkspaceID, ProjectID: kc.ProjectID,
		ProjectSlug: kc.ProjectSlug, ProjectName: kc.ProjectName,
		KeyStatus: kc.KeyStatus, Scopes: kc.Scopes,
		Bound: kc.Bound, Sealed: kc.Sealed, MerchantID: kc.MerchantID,
		WalletID: kc.WalletID, WalletAccountID: kc.WalletAccountID,
	}
	// Attribute the request log HERE, at the one point a developer key is ever
	// accepted, so the Console's Logs screen cannot miss a request because a
	// handler forgot to emit one. See apilog.go.
	AttributeRequest(r.Context(), p)
	return p, true
}

// isDeveloperKeyAttempt reports whether the request presents a developer-platform
// credential (by prefix or the X-API-Key transport) rather than a merchant JWT.
// This is the EXPLICIT credential-type decision that keeps the two auth paths
// separate: a bz_-prefixed credential (test OR live OR forged) is always handled
// by the developer-key path — it can never silently fall through to JWT — and a
// JWT (no bz_ prefix, no X-API-Key) is never sent to developer-key introspection.
func isDeveloperKeyAttempt(r *http.Request) bool {
	if strings.TrimSpace(r.Header.Get("X-API-Key")) != "" {
		return true
	}
	raw := extractDevKey(r)
	return strings.HasPrefix(raw, "bz_test_") || strings.HasPrefix(raw, "bz_live_") ||
		strings.HasPrefix(raw, "bz_sk_") || strings.HasPrefix(raw, "bz_pk_")
}

// GetDeveloperPrincipal returns the authenticated developer principal.
func GetDeveloperPrincipal(ctx context.Context) (*DeveloperPrincipal, bool) {
	p, ok := ctx.Value(devPrincipalKey{}).(*DeveloperPrincipal)
	return p, ok
}

// ContextWithDeveloperPrincipal returns a context carrying the given developer
// principal. Used by tests and by dual-credential routing to inject a resolved
// principal without re-running introspection.
func ContextWithDeveloperPrincipal(ctx context.Context, p *DeveloperPrincipal) context.Context {
	return context.WithValue(ctx, devPrincipalKey{}, p)
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

// DeveloperKeyRateLimit rate-limits the developer-key surface on the resolved,
// NON-SECRET key id (never the raw key). Must run AFTER DeveloperKeyAuth. Fails
// open if Redis is unavailable (availability over strictness for a diagnostic).
func DeveloperKeyRateLimit(rdb *redis.Client) func(http.Handler) http.Handler {
	const perMinute = 120
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := GetDeveloperPrincipal(r.Context())
			if rdb == nil || !ok {
				next.ServeHTTP(w, r)
				return
			}
			key := fmt.Sprintf("rl:devkey:%s", p.KeyID)
			allowed, err := slidingWindowAllow(r.Context(), rdb, key, perMinute, time.Minute)
			if err != nil {
				next.ServeHTTP(w, r) // fail open
				return
			}
			if !allowed {
				w.Header().Set("Retry-After", "60")
				apierror.Respond(w, r, http.StatusTooManyRequests, "RATE_LIMITED", "too many requests")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// extractDevKey reads the key from Authorization: Bearer <key> or X-API-Key.
func extractDevKey(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	return strings.TrimSpace(r.Header.Get("X-API-Key"))
}
