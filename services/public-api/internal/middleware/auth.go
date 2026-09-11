package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/config"
)

// Consumer represents an authenticated consumer extracted from a verified JWT.
type Consumer struct {
	ID     string
	Scopes []string
	// TokenVersion is the session version the token was issued under; a
	// sign-out bumps the consumer's version and ends every older token.
	TokenVersion int
}

// SessionChecker says whether a consumer's token is still good: the consumer
// is ACTIVE and the token carries the current session version.
type SessionChecker interface {
	SessionValid(ctx context.Context, consumerID string, tokenVersion int) (bool, error)
}

type consumerKey struct{}

// Auth returns middleware that enforces JWT Bearer authentication for consumers.
//
// A valid signature is not enough: the token must still name a live session —
// the consumer ACTIVE and on the version the token was issued under. A 24-hour
// token used to outlive a sign-out (there was none) and a suspension. Without
// a way to check, nothing is let through.
func Auth(cfg *config.Config, sessions SessionChecker) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, err := extractBearer(r)
			if err != nil {
				apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", err.Error())
				return
			}

			consumer, err := verifyJWT(raw, cfg.JWTSecret)
			if err != nil {
				apierror.Respond(w, r, http.StatusUnauthorized, "INVALID_TOKEN",
					"token is invalid or expired")
				return
			}
			if sessions == nil {
				apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE",
					"sessions cannot be checked right now")
				return
			}
			live, err := sessions.SessionValid(r.Context(), consumer.ID, consumer.TokenVersion)
			if err != nil {
				apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE",
					"sessions cannot be checked right now")
				return
			}
			if !live {
				apierror.Respond(w, r, http.StatusUnauthorized, "INVALID_TOKEN",
					"this session has ended — sign in again")
				return
			}

			ctx := context.WithValue(r.Context(), consumerKey{}, consumer)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetConsumer retrieves the authenticated consumer from context.
// Returns (nil, false) on unauthenticated requests.
func GetConsumer(ctx context.Context) (*Consumer, bool) {
	c, ok := ctx.Value(consumerKey{}).(*Consumer)
	return c, ok
}

// InjectConsumer sets the authenticated consumer in a context.
// Used by the Auth middleware and by handler tests to simulate authentication.
func InjectConsumer(ctx context.Context, c *Consumer) context.Context {
	return context.WithValue(ctx, consumerKey{}, c)
}

// NewConsumerToken mints a signed JWT for the given consumer.
// The returned expiresAt string is RFC3339, suitable for API responses.
func NewConsumerToken(secret, consumerID string, tokenVersion int, scopes []string, ttl time.Duration) (token, expiresAt string, err error) {
	// SEC-001 fail-closed: never mint a token signed with an empty key.
	if secret == "" {
		return "", "", errNoSigningKey
	}
	now := time.Now()
	exp := now.Add(ttl)
	claims := &jwtClaims{
		CustomerID:   consumerID,
		Scopes:       scopes,
		TokenVersion: tokenVersion,
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
	CustomerID string   `json:"customer_id,omitempty"`
	Scopes     []string `json:"scopes"`
	// TokenVersion: the consumer's session version at issue ("tv"). A token
	// minted before versions existed reads 0, the version every consumer
	// starts on, so it stays good until the first sign-out.
	TokenVersion int `json:"tv"`
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

// errNoSigningKey — SEC-001 (see api-gateway): an empty HMAC key is a valid
// HS256 key, so verifying against "" would accept any attacker-forged consumer
// token. Config.Load already refuses to start without JWT_SECRET; this is the
// defence-in-depth runtime guard so no code path can ever verify with "".
var errNoSigningKey = errors.New("jwt signing key is not configured")

func verifyJWT(tokenStr, secret string) (*Consumer, error) {
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
	if !ok || !tok.Valid || c.CustomerID == "" {
		return nil, errors.New("invalid token claims")
	}

	return &Consumer{
		ID:           c.CustomerID,
		Scopes:       c.Scopes,
		TokenVersion: c.TokenVersion,
	}, nil
}
