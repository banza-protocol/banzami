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
}

type consumerKey struct{}

// Auth returns middleware that enforces JWT Bearer authentication for consumers.
func Auth(cfg *config.Config) func(http.Handler) http.Handler {
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
func NewConsumerToken(secret, consumerID string, scopes []string, ttl time.Duration) (token, expiresAt string, err error) {
	now := time.Now()
	exp := now.Add(ttl)
	claims := &jwtClaims{
		CustomerID: consumerID,
		Scopes:     scopes,
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

func verifyJWT(tokenStr, secret string) (*Consumer, error) {
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
		ID:     c.CustomerID,
		Scopes: c.Scopes,
	}, nil
}
