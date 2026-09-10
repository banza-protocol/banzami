package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Activation-token onboarding (Merchant Lifecycle, Track 4). On approval a
// credential is created WITHOUT a PIN; a single-use, hashed, expiring token is
// emailed as a link. The merchant sets their own PIN on the activation page,
// which sets pin_hash + activated_at. No PIN ever travels by email.

var (
	ErrActivationInvalid = errors.New("activation token is invalid")
	ErrActivationExpired = errors.New("activation token has expired")
	ErrActivationUsed    = errors.New("activation token has already been used")
)

// ActivationStatus is the non-secret result of validating a token (used to
// render the activation page). It never contains the token, hash, or PIN.
type ActivationStatus struct {
	Valid        bool
	Reason       string // VALID | INVALID | EXPIRED | USED
	BusinessName string
	Handle       string
}

type ActivationService interface {
	// CreateToken issues a single-use activation token and returns the RAW token
	// (for the email link). Only its sha256 hash is stored.
	CreateToken(ctx context.Context, merchantID, environment string, ttl time.Duration) (rawToken string, err error)
	Validate(ctx context.Context, rawToken string) (ActivationStatus, error)
	Complete(ctx context.Context, rawToken, pin string) error
}

type PostgresActivationService struct {
	pool *pgxpool.Pool
}

func NewPostgresActivationService(pool *pgxpool.Pool) *PostgresActivationService {
	return &PostgresActivationService{pool: pool}
}

// hashToken returns the hex sha256 of a raw token. The raw token is never stored.
func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// randomToken returns a URL-safe random token with nbytes of entropy.
func randomToken(nbytes int) (string, error) {
	b := make([]byte, nbytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func (s *PostgresActivationService) CreateToken(ctx context.Context, merchantID, environment string, ttl time.Duration) (string, error) {
	raw, err := randomToken(32) // 256 bits
	if err != nil {
		return "", err
	}
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO merchant_activation_tokens (id, merchant_id, environment, token_hash, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		uuid.NewString(), merchantID, environment, hashToken(raw), time.Now().Add(ttl)); err != nil {
		return "", err
	}
	return raw, nil
}

func (s *PostgresActivationService) Validate(ctx context.Context, rawToken string) (ActivationStatus, error) {
	if rawToken == "" {
		return ActivationStatus{Reason: "INVALID"}, nil
	}
	var (
		expiresAt    time.Time
		usedAt       *time.Time
		businessName *string
		handle       *string
	)
	err := s.pool.QueryRow(ctx,
		`SELECT t.expires_at, t.used_at, m.name, c.handle
		   FROM merchant_activation_tokens t
		   JOIN merchants m ON m.id = t.merchant_id
		   LEFT JOIN merchant_app_credentials c
		     ON c.merchant_id = t.merchant_id AND c.environment = t.environment
		  WHERE t.token_hash = $1`, hashToken(rawToken)).
		Scan(&expiresAt, &usedAt, &businessName, &handle)
	if errors.Is(err, pgx.ErrNoRows) {
		return ActivationStatus{Reason: "INVALID"}, nil
	}
	if err != nil {
		return ActivationStatus{}, err
	}
	if usedAt != nil {
		return ActivationStatus{Reason: "USED"}, nil
	}
	if expiresAt.Before(time.Now()) {
		return ActivationStatus{Reason: "EXPIRED"}, nil
	}
	return ActivationStatus{
		Valid:        true,
		Reason:       "VALID",
		BusinessName: deref(businessName),
		Handle:       deref(handle),
	}, nil
}

// Complete validates the token and sets the merchant's PIN, atomically marking
// the credential activated and the token used.
func (s *PostgresActivationService) Complete(ctx context.Context, rawToken, pin string) error {
	if ValidatePin(pin) != nil {
		return ErrPinInvalid
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var (
		tokenID     string
		merchantID  string
		environment string
		expiresAt   time.Time
		usedAt      *time.Time
	)
	scanErr := tx.QueryRow(ctx,
		`SELECT id::text, merchant_id::text, environment, expires_at, used_at
		   FROM merchant_activation_tokens WHERE token_hash = $1 FOR UPDATE`, hashToken(rawToken)).
		Scan(&tokenID, &merchantID, &environment, &expiresAt, &usedAt)
	if errors.Is(scanErr, pgx.ErrNoRows) {
		return ErrActivationInvalid
	}
	if scanErr != nil {
		return scanErr
	}
	if usedAt != nil {
		return ErrActivationUsed
	}
	if expiresAt.Before(time.Now()) {
		return ErrActivationExpired
	}

	pinHash, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	ct, err := tx.Exec(ctx,
		`UPDATE merchant_app_credentials
		    SET pin_hash = $1, activated_at = now(), failed_attempts = 0,
		        locked_until = NULL, updated_at = now()
		  WHERE merchant_id = $2 AND environment = $3`,
		string(pinHash), merchantID, environment)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		// No pending credential for this merchant/environment.
		return ErrActivationInvalid
	}

	if _, err := tx.Exec(ctx,
		`UPDATE merchant_activation_tokens SET used_at = now() WHERE id = $1`, tokenID); err != nil {
		return err
	}

	// A new PIN is a new sign-in: whatever was signed in with the old one —
	// including a device the Business may have lost — has to sign in again.
	// (A first activation has no sessions; this touches nothing then.)
	if _, err := tx.Exec(ctx,
		`UPDATE merchant_app_sessions SET revoked_at = now(), revoked_reason = 'SIGNED_OUT'
		  WHERE merchant_id = $1 AND environment = $2 AND revoked_at IS NULL`,
		merchantID, environment); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
