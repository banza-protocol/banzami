package accountidentity

import (
	"context"
	"errors"
	"time"
)

// Store is the Account Identity persistence port (account_identity.* schema).
// Implemented by pgStore (Postgres) and memStore (in-memory, for tests / local).
// It owns the atomic OTP verify+consume so attempt-limiting and one-time-use are
// enforced in a single transaction.
type Store interface {
	// IssueOTP invalidates any prior active code for (email, purpose) and inserts
	// a new one — enforcing "one active OTP per canonical email + purpose".
	IssueOTP(ctx context.Context, in OTPInsert) error
	// VerifyOTP atomically checks the latest active code for (email, purpose):
	// expiry, attempt limit, then a constant-time hash compare; on match it marks
	// the code consumed, otherwise it increments the attempt counter.
	VerifyOTP(ctx context.Context, email, purpose, code, pepper string) (OTPResult, error)

	// UpsertVerifiedUser lazily creates the user on first successful verification
	// and marks it verified. Canonical (lower) email.
	UpsertVerifiedUser(ctx context.Context, email string) (User, error)
	// LiveSessions lists the person's own unexpired, unrevoked sessions.
	LiveSessions(ctx context.Context, userID string) ([]SessionView, error)
	// RevokeOtherSessions ends every session of this person EXCEPT the one
	// making the request. Signing out everywhere else is the one recovery a
	// person has when a device is lost, and it must not end the session they are
	// using to ask for it.
	RevokeOtherSessions(ctx context.Context, userID, keepSessionID string) (int, error)
	// UserByID loads a user by id (for /auth/me and the session guard).
	UserByID(ctx context.Context, id string) (User, error)
	// SetUserName records the person's display name.
	//
	// The column shipped with the table and nothing ever wrote it. Sign-up is
	// email-OTP only, so every account's name was empty, and the Console's header
	// avatar — which falls back to the first two letters of the email — showed
	// the same two characters for everybody at a domain. There was no way to tell
	// two colleagues apart in a shared workspace.
	SetUserName(ctx context.Context, id, name string) (User, error)

	CreateSession(ctx context.Context, in SessionInsert) error
	// LiveSessionByHash returns a non-revoked, non-expired session by token hash.
	LiveSessionByHash(ctx context.Context, tokenHash string) (*Session, error)
	TouchSession(ctx context.Context, id string) error
	RevokeSessionByHash(ctx context.Context, tokenHash string) error

	// InsertAudit appends a context-owned, append-only audit event.
	InsertAudit(ctx context.Context, ev AuditEvent) error
}

// OTPResult is the outcome of an atomic verify.
type OTPResult int

const (
	OTPOK OTPResult = iota
	OTPInvalid
	OTPNoActive
	OTPExpired
	OTPTooManyAttempts
)

type OTPInsert struct {
	Email       string // canonical (lower)
	Purpose     string
	CodeHash    string
	HashVersion int
	ExpiresAt   time.Time
	RequestIP   string
}

type User struct {
	ID        string
	Email     string
	Name      string
	Verified  bool
	Status    string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Session struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
}

// SessionView is one of the person's live sessions, as the Account surface
// shows it. Never the token or its hash: a list that carried either would hand
// every reader of the page the ability to become the person on another device.
type SessionView struct {
	ID         string     `json:"id"`
	UserAgent  string     `json:"user_agent"`
	IP         string     `json:"ip"`
	Current    bool       `json:"current"`
	CreatedAt  time.Time  `json:"created_at"`
	LastSeenAt *time.Time `json:"last_seen_at"`
	ExpiresAt  time.Time  `json:"expires_at"`
}

type SessionInsert struct {
	UserID    string
	TokenHash string
	UserAgent string
	IP        string
	ExpiresAt time.Time
}

// AuditEvent is a context-owned audit record. Never carries raw OTP codes,
// session tokens or other secrets.
type AuditEvent struct {
	ActorUserID *string
	Action      string
	Subject     string
	Metadata    map[string]any
	RequestIP   string
	RequestID   string
}

// ErrNotFound is returned by lookups when nothing matches.
var ErrNotFound = errors.New("not found")
