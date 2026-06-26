// Package auth implements operator authentication for the Banzami Admin portal:
// bcrypt passwords, an admin-only JWT, and a request-scoped AdminPrincipal.
// It deliberately has NO knowledge of the legacy ADMIN_API_KEY.
package auth

import (
	"context"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrWeakPassword = errors.New("password must be at least 12 characters")
	ErrInvalidToken = errors.New("invalid or expired token")
)

// MinPasswordLen is the operator password floor: at least 12 characters. We do
// NOT require uppercase/number/symbol — length (a long passphrase) is what
// matters and is friendlier than composition rules.
const MinPasswordLen = 12

// Principal is the authenticated operator attached to each request. TokenVersion
// is the session-revocation counter carried in the JWT and re-checked against the
// database on every request.
type Principal struct {
	ID           string
	Email        string
	FullName     string
	Role         string
	TokenVersion int
}

// Actor is the value stored in audit / reviewed_by fields.
func (p Principal) Actor() string { return p.Email }

type ctxKey struct{}

func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, ctxKey{}, p)
}

func FromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(ctxKey{}).(Principal)
	return p, ok
}

// HashPassword bcrypt-hashes a password (min 12 chars). Never logs the input.
func HashPassword(password string) (string, error) {
	if len(password) < MinPasswordLen {
		return "", ErrWeakPassword
	}
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// VerifyPassword reports whether password matches the bcrypt hash.
func VerifyPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// dummyHash is a fixed bcrypt hash used purely to equalize timing on the login
// path: when the email is unknown (or the account has no password set) we still
// run one bcrypt comparison so an attacker cannot distinguish existing accounts
// by response latency. The plaintext is irrelevant — it never matches anything.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("banzami-login-timing-equalizer"), bcrypt.DefaultCost)

// DummyVerify burns one bcrypt comparison and always reports false. Used to make
// the unknown-account login path cost the same as a real verification.
func DummyVerify(password string) bool {
	return bcrypt.CompareHashAndPassword(dummyHash, []byte(password)) == nil
}

// Claims is the admin JWT payload. Distinct from consumer/merchant tokens, and
// deliberately minimal: only the subject (operator id), email, role and the
// session-revocation counter — plus standard iat/exp/iss. It never carries the
// full name, a permission list, password material or any hash; identity details
// and live status are re-loaded from the database on every request.
type Claims struct {
	Email        string `json:"email"`
	Role         string `json:"role"`
	TokenVersion int    `json:"token_version"`
	jwt.RegisteredClaims
}

// Issue signs an admin JWT valid for ttl. Returns the token and its expiry.
func Issue(secret string, p Principal, ttl time.Duration, now time.Time) (string, time.Time, error) {
	exp := now.Add(ttl)
	claims := Claims{
		Email:        p.Email,
		Role:         p.Role,
		TokenVersion: p.TokenVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   p.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
			Issuer:    "banzami-admin",
		},
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	return tok, exp, err
}

// Parse validates a token and returns the principal it carries. FullName is left
// empty here: the auth middleware fills it from the database after re-checking
// status and token_version.
func Parse(secret, token string) (Principal, error) {
	if secret == "" {
		return Principal{}, ErrInvalidToken
	}
	claims := &Claims{}
	t, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return []byte(secret), nil
	})
	if err != nil || !t.Valid {
		return Principal{}, ErrInvalidToken
	}
	return Principal{ID: claims.Subject, Email: claims.Email, Role: claims.Role, TokenVersion: claims.TokenVersion}, nil
}
