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
	// Purpose is what the presented token was issued for. Normalised to
	// PurposeSession when the token predates the claim.
	Purpose string
	// AuthTime is when the operator last proved both factors at sign-in. A
	// session slides forward with activity but never past AuthTime plus the
	// absolute lifetime (A5-08). Zero on the pre-session tokens.
	AuthTime time.Time
	// SteppedUpAt is when the operator last proved a fresh second factor
	// inside this session. The highest-risk routes require it to be recent
	// (A5-08). Zero means never.
	SteppedUpAt time.Time
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
	// Purpose separates a full operator session from the short-lived tokens the
	// second factor issues. A token that only proves a password must not be
	// usable anywhere a session is, and the difference has to be IN the token —
	// inferring it from which endpoint minted it is how a challenge token ends
	// up authorising an approval.
	//
	// Empty means PurposeSession, so tokens issued before this existed keep
	// working until they expire.
	Purpose string `json:"purpose,omitempty"`
	// AuthTime and SteppedUpAt are unix seconds; see Principal. Both are
	// carried forward, unchanged, every time the session slides.
	AuthTime    int64 `json:"auth_time,omitempty"`
	SteppedUpAt int64 `json:"stepped_up_at,omitempty"`
	jwt.RegisteredClaims
}

// What a token is for.
const (
	// PurposeSession — a full operator session. The only purpose the
	// authenticated middleware accepts.
	PurposeSession = "session"
	// PurposeMFAChallenge — the password was correct and the second factor has
	// not been presented yet. Usable only to complete MFA.
	PurposeMFAChallenge = "mfa"
	// PurposeMFAEnroll — the password was correct and the operator has no
	// confirmed factor. Usable only to enrol one.
	PurposeMFAEnroll = "mfa_enroll"
	// PurposeMFAAck — the factor is enrolled and the recovery codes have just
	// been shown, once. Usable only to acknowledge them.
	//
	// The state lives in the token rather than a column because it is a state of
	// the LOGIN, not of the operator: the factor is already confirmed and the
	// codes already issued, so an operator who closes the tab has lost nothing
	// but this session. Their next login takes the ordinary challenge path.
	PurposeMFAAck = "mfa_ack"
)

// Issue signs an admin JWT valid for ttl. Returns the token and its expiry.
func Issue(secret string, p Principal, ttl time.Duration, now time.Time) (string, time.Time, error) {
	exp := now.Add(ttl)
	purpose := p.Purpose
	if purpose == "" {
		purpose = PurposeSession
	}
	claims := Claims{
		Email:        p.Email,
		Role:         p.Role,
		TokenVersion: p.TokenVersion,
		Purpose:      purpose,
		AuthTime:     unixOrZero(p.AuthTime),
		SteppedUpAt:  unixOrZero(p.SteppedUpAt),
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
	purpose := claims.Purpose
	if purpose == "" {
		purpose = PurposeSession
	}
	return Principal{
		ID: claims.Subject, Email: claims.Email, Role: claims.Role, TokenVersion: claims.TokenVersion, Purpose: purpose,
		AuthTime: timeOrZero(claims.AuthTime), SteppedUpAt: timeOrZero(claims.SteppedUpAt),
	}, nil
}

func unixOrZero(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.Unix()
}

func timeOrZero(s int64) time.Time {
	if s == 0 {
		return time.Time{}
	}
	return time.Unix(s, 0)
}
