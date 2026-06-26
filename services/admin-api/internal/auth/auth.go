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
	ErrWeakPassword = errors.New("password must be at least 10 characters")
	ErrInvalidToken = errors.New("invalid or expired token")
)

const minPasswordLen = 10

// Principal is the authenticated operator attached to each request.
type Principal struct {
	ID       string
	Email    string
	FullName string
	Role     string
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

// HashPassword bcrypt-hashes a password (min 10 chars). Never logs the input.
func HashPassword(password string) (string, error) {
	if len(password) < minPasswordLen {
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

// Claims is the admin JWT payload. Distinct from consumer/merchant tokens.
type Claims struct {
	AdminUserID string `json:"admin_user_id"`
	Email       string `json:"email"`
	FullName    string `json:"full_name"`
	Role        string `json:"role"`
	jwt.RegisteredClaims
}

// Issue signs an admin JWT valid for ttl. Returns the token and its expiry.
func Issue(secret string, p Principal, ttl time.Duration, now time.Time) (string, time.Time, error) {
	exp := now.Add(ttl)
	claims := Claims{
		AdminUserID: p.ID,
		Email:       p.Email,
		FullName:    p.FullName,
		Role:        p.Role,
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

// Parse validates a token and returns the principal it carries.
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
	return Principal{ID: claims.AdminUserID, Email: claims.Email, FullName: claims.FullName, Role: claims.Role}, nil
}
