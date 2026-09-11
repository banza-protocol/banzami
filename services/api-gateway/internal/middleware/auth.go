package middleware

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/config"
)

// Principal represents an authenticated caller extracted from a verified JWT.
type Principal struct {
	// Exactly one of MerchantID or CustomerID is set per token.
	MerchantID string
	CustomerID string
	// Scopes controls what the principal is allowed to do.
	// Use "*" to grant full access (admin/internal tokens only).
	Scopes []string
	// Environment is "LIVE" or "SANDBOX" — derived from the API key used to
	// obtain this token. All data access is scoped to this environment;
	// cross-environment operations are rejected at the handler layer.
	Environment string
}

type principalKey struct{}

// Auth returns middleware that enforces JWT Bearer authentication.
// Requests without a valid token receive 401. Scope checks are done separately
// via RequireScope so that different routes can demand different permissions.
func Auth(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, err := extractBearer(r)
			if err != nil {
				slog.WarnContext(r.Context(), "auth.missing_token",
					"ip", r.RemoteAddr,
					"path", LoggedPath(r.URL.Path),
					"user_agent", r.Header.Get("User-Agent"),
				)
				apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", err.Error())
				return
			}

			principal, err := verifyJWT(raw, cfg.JWTSecret)
			if err != nil {
				slog.WarnContext(r.Context(), "auth.invalid_token",
					"ip", r.RemoteAddr,
					"path", LoggedPath(r.URL.Path),
					"reason", err.Error(),
				)
				apierror.Respond(w, r, http.StatusUnauthorized, "INVALID_TOKEN",
					"token is invalid or expired")
				return
			}

			slog.DebugContext(r.Context(), "auth.ok",
				"merchant_id", principal.MerchantID,
				"customer_id", principal.CustomerID,
				"path", LoggedPath(r.URL.Path),
			)

			ctx := context.WithValue(r.Context(), principalKey{}, principal)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetPrincipal retrieves the authenticated principal from context.
// Returns (nil, false) on unauthenticated requests.
func GetPrincipal(ctx context.Context) (*Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(*Principal)
	return p, ok
}

// ContextWithPrincipal returns a new context carrying the given principal.
// Used in tests and by internal middleware that need to inject a principal
// without going through JWT verification (e.g. service-to-service calls).
func ContextWithPrincipal(ctx context.Context, p *Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

// RequireScope returns middleware that rejects requests missing the given scope.
// Must be used inside an Auth-protected route group.
func RequireScope(scope string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := GetPrincipal(r.Context())
			if !ok {
				apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED",
					"authentication required")
				return
			}
			for _, s := range p.Scopes {
				if s == scope || s == "*" {
					next.ServeHTTP(w, r)
					return
				}
			}
			apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
				"missing required scope: "+scope)
		})
	}
}

// NewMerchantToken mints a signed JWT for the given merchant. The returned
// string is the expiry time in RFC3339, suitable for inclusion in the response.
// environment must be "LIVE" or "SANDBOX" and is embedded as a claim so that
// every downstream handler knows which data universe the caller may access.
func NewMerchantToken(secret, merchantID string, scopes []string, environment string, ttl time.Duration) (token, expiresAt string, err error) {
	// SEC-001 fail-closed: refuse to mint a token that would be signed with an
	// empty key (such a token is forgeable by anyone).
	if secret == "" {
		return "", "", errNoSigningKey
	}
	now := time.Now()
	exp := now.Add(ttl)
	claims := &jwtClaims{
		MerchantID:  merchantID,
		Scopes:      scopes,
		Environment: environment,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		return "", "", err
	}
	return signed, exp.UTC().Format(time.RFC3339), nil
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type jwtClaims struct {
	MerchantID  string   `json:"merchant_id,omitempty"`
	CustomerID  string   `json:"customer_id,omitempty"`
	Scopes      []string `json:"scopes"`
	Environment string   `json:"environment,omitempty"` // "LIVE" | "SANDBOX"
	jwt.RegisteredClaims
}

func extractBearer(r *http.Request) (string, error) {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return "", errors.New("missing Authorization header")
	}
	scheme, token, found := strings.Cut(auth, " ")
	if !found || !strings.EqualFold(scheme, "bearer") || strings.TrimSpace(token) == "" {
		return "", errors.New("Authorization header format must be: Bearer <token>")
	}
	return strings.TrimSpace(token), nil
}

// errNoSigningKey is returned whenever a JWT operation is attempted without a
// configured signing key. SEC-001: an empty HMAC key is a *valid* HS256 key, so
// verifying against "" would accept any attacker-forged token (arbitrary
// merchant_id, scopes ["*"], environment "LIVE"). Authentication must fail
// closed when the key is absent, never fall back to the empty key.
var errNoSigningKey = errors.New("jwt signing key is not configured")

func verifyJWT(tokenStr, secret string) (*Principal, error) {
	// SEC-001 fail-closed: never verify a token against an empty key.
	if secret == "" {
		return nil, errNoSigningKey
	}
	tok, err := jwt.ParseWithClaims(
		tokenStr,
		&jwtClaims{},
		func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("unexpected signing algorithm")
			}
			return []byte(secret), nil
		},
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
	)
	if err != nil {
		return nil, err
	}

	c, ok := tok.Claims.(*jwtClaims)
	if !ok || !tok.Valid {
		return nil, errors.New("invalid token claims")
	}

	return &Principal{
		MerchantID:  c.MerchantID,
		CustomerID:  c.CustomerID,
		Scopes:      c.Scopes,
		Environment: c.Environment,
	}, nil
}

// RequireMerchant rejects any request whose principal is not a Business Account
// (SEC-004).
//
// The gateway deliberately accepts BOTH merchant tokens and consumer tokens:
// consumer KYC (/v1/compliance/customers/...) is a legitimate consumer-token
// route. Consumer tokens are minted by public-api with the SAME HS256 secret and
// the same claim shape, so `Auth` alone cannot tell the two apart — a consumer
// token authenticates successfully on the merchant surface. Any merchant-surface
// route that does not itself consult principal.MerchantID would therefore accept
// an ordinary wallet user's token.
//
// This middleware makes the principal TYPE an explicit, route-level requirement
// so the merchant surface fails closed for consumer credentials, independently of
// whether each individual handler remembers to check.
func RequireMerchant(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := GetPrincipal(r.Context())
		if !ok {
			apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
			return
		}
		if p.MerchantID == "" {
			slog.WarnContext(r.Context(), "auth.non_merchant_principal_on_merchant_surface",
				"path", LoggedPath(r.URL.Path), "has_customer_id", p.CustomerID != "")
			apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant credentials required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireMerchantExcept is RequireMerchant for a whole route group, naming the
// path prefixes inside it that a consumer token may legitimately reach.
//
// RequireMerchant was opt-in per route and only /merchants, /wallets and
// /consumers had opted in, so every other route of the merchant surface let a
// consumer token through to handlers that had to remember to check — the same
// shape that let a consumer token list and cancel another merchant's payment
// links on the dual-credential surface. The exception is now the explicit list,
// and a new route is gated by default.
func RequireMerchantExcept(consumerPrefixes ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		gated := RequireMerchant(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			for _, prefix := range consumerPrefixes {
				if strings.HasPrefix(r.URL.Path, prefix) {
					next.ServeHTTP(w, r)
					return
				}
			}
			gated.ServeHTTP(w, r)
		})
	}
}
