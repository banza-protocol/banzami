package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Realtime status tokens (ADR-060 §9, REALTIME-001).
//
// A status token lets a browser watch ONE Payment Session's public status for a
// short time. It is not an API key and carries no authority:
//
//   - read-only by construction — the only route that accepts it is the
//     realtime status route, which has no write method;
//   - bound to one session id and one environment, both inside the MAC;
//   - short-lived (RealtimeTokenTTL), never refreshed by itself — the developer's
//     backend reads the session again for a new one;
//   - free of internal identifiers: session id, environment and expiry only.
//
// Format: "bzst_" + base64url(payload) + "." + base64url(HMAC-SHA256(key, payload)).
// The key is derived from the gateway's signing secret with a fixed label, so a
// status token can never be confused with, or forged from, a session JWT.

// RealtimeTokenPrefix identifies a status token in an Authorization header.
const RealtimeTokenPrefix = "bzst_"

// RealtimeTokenTTL is the lifetime policy. A policy test holds it at or below
// 30 minutes: the token is a UI convenience, and a stolen one should stop
// working well before the session's own expiry matters.
const RealtimeTokenTTL = 30 * time.Minute

// RealtimeTokenMaxTTL is the ceiling the policy test enforces.
const RealtimeTokenMaxTTL = 30 * time.Minute

var (
	ErrRealtimeTokenInvalid       = errors.New("realtime token is invalid")
	ErrRealtimeTokenExpired       = errors.New("realtime token has expired")
	ErrRealtimeTokenWrongResource = errors.New("realtime token is for another payment session")
	ErrRealtimeTokenWrongEnv      = errors.New("realtime token is for another environment")
)

type realtimeClaims struct {
	SessionID   string `json:"sid"`
	Environment string `json:"env"`
	ExpiresAt   int64  `json:"exp"`
}

// RealtimeTokens mints and verifies status tokens for one environment.
type RealtimeTokens struct {
	key         []byte
	environment string
	now         func() time.Time
}

// NewRealtimeTokens derives the token key from the gateway signing secret.
// Returns nil when there is no secret, so an unconfigured gateway offers no
// realtime rather than tokens signed with an empty key.
func NewRealtimeTokens(signingSecret, environment string) *RealtimeTokens {
	if strings.TrimSpace(signingSecret) == "" {
		return nil
	}
	mac := hmac.New(sha256.New, []byte(signingSecret))
	mac.Write([]byte("banzami/realtime-status-token/v1"))
	return &RealtimeTokens{key: mac.Sum(nil), environment: strings.ToUpper(strings.TrimSpace(environment)), now: time.Now}
}

// Mint returns a token for sessionID and its expiry.
func (t *RealtimeTokens) Mint(sessionID string) (string, time.Time) {
	exp := t.now().Add(RealtimeTokenTTL).UTC().Truncate(time.Second)
	payload, _ := json.Marshal(realtimeClaims{SessionID: sessionID, Environment: t.environment, ExpiresAt: exp.Unix()})
	enc := base64.RawURLEncoding.EncodeToString(payload)
	return RealtimeTokenPrefix + enc + "." + t.sign(enc), exp
}

func (t *RealtimeTokens) sign(enc string) string {
	mac := hmac.New(sha256.New, t.key)
	mac.Write([]byte(enc))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// Verify checks a token for sessionID and returns its expiry.
func (t *RealtimeTokens) Verify(token, sessionID string) (time.Time, error) {
	if !strings.HasPrefix(token, RealtimeTokenPrefix) {
		return time.Time{}, ErrRealtimeTokenInvalid
	}
	body := strings.TrimPrefix(token, RealtimeTokenPrefix)
	enc, sig, ok := strings.Cut(body, ".")
	if !ok || enc == "" || sig == "" {
		return time.Time{}, ErrRealtimeTokenInvalid
	}
	if subtle.ConstantTimeCompare([]byte(sig), []byte(t.sign(enc))) != 1 {
		return time.Time{}, ErrRealtimeTokenInvalid
	}
	raw, err := base64.RawURLEncoding.DecodeString(enc)
	if err != nil {
		return time.Time{}, ErrRealtimeTokenInvalid
	}
	var c realtimeClaims
	if json.Unmarshal(raw, &c) != nil || c.SessionID == "" || c.ExpiresAt == 0 {
		return time.Time{}, ErrRealtimeTokenInvalid
	}
	exp := time.Unix(c.ExpiresAt, 0)
	// A token claiming a lifetime beyond the policy was not minted here.
	if exp.Sub(t.now()) > RealtimeTokenMaxTTL+time.Minute {
		return time.Time{}, ErrRealtimeTokenInvalid
	}
	if !t.now().Before(exp) {
		return time.Time{}, ErrRealtimeTokenExpired
	}
	if c.Environment != t.environment {
		return time.Time{}, ErrRealtimeTokenWrongEnv
	}
	if subtle.ConstantTimeCompare([]byte(c.SessionID), []byte(sessionID)) != 1 {
		return time.Time{}, ErrRealtimeTokenWrongResource
	}
	return exp, nil
}
