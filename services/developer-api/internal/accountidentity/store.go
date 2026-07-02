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
	// UserByID loads a user by id (for /auth/me and the session guard).
	UserByID(ctx context.Context, id string) (User, error)

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
