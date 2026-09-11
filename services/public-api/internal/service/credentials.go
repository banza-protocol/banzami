package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// ErrInvalidCredentials is returned when handle+PIN do not match.
var ErrInvalidCredentials = errors.New("invalid handle or PIN")

// ErrHandleAlreadyRegistered is returned when the handle is taken.
var ErrHandleAlreadyRegistered = errors.New("handle already registered")

// CredentialStore persists consumer PIN hashes in public_api_credentials.
// It is the only table owned by this service — all financial data lives in core.
type CredentialStore struct {
	pool *pgxpool.Pool
}

func NewCredentialStore(pool *pgxpool.Pool) *CredentialStore {
	return &CredentialStore{pool: pool}
}

// credentialRow mirrors the public_api_credentials table.
type credentialRow struct {
	ConsumerID string
	Handle     string
	PinHash    string
	CreatedAt  time.Time
}

// Save persists a new credential record. Returns ErrHandleAlreadyRegistered
// if the handle is already taken.
func (s *CredentialStore) Save(ctx context.Context, consumerID, handle, rawPin string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(rawPin), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("bcrypt: %w", err)
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO public_api_credentials (consumer_id, handle, pin_hash)
		 VALUES ($1, $2, $3)`,
		consumerID, handle, string(hash),
	)
	if err != nil {
		if isUniqueViolation(err) {
			return ErrHandleAlreadyRegistered
		}
		return fmt.Errorf("credential insert: %w", err)
	}
	return nil
}

// GetHandle returns the @banza handle for a given consumer ID.
// Used by the transfer handler to resolve the sender's handle from the JWT claim.
// Returns ErrInvalidCredentials when the consumer is not in the credential store.
func (s *CredentialStore) GetHandle(ctx context.Context, consumerID string) (string, error) {
	var handle string
	err := s.pool.QueryRow(ctx,
		`SELECT handle FROM public_api_credentials WHERE consumer_id = $1`,
		consumerID,
	).Scan(&handle)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrInvalidCredentials
		}
		return "", fmt.Errorf("credential handle lookup: %w", err)
	}
	return handle, nil
}

// Exists reports whether a handle is registered.
func (s *CredentialStore) Exists(ctx context.Context, handle string) (bool, error) {
	var found bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM public_api_credentials WHERE handle = $1)`,
		handle,
	).Scan(&found)
	if err != nil {
		return false, fmt.Errorf("credential exists: %w", err)
	}
	return found, nil
}

// ErrCredentialsLocked: too many wrong PINs for this handle; wait for the lock.
var ErrCredentialsLocked = errors.New("too many attempts")

// Login attempt limits per account (A9-01). Five tries, then fifteen minutes.
const (
	maxLoginAttempts = 5
	loginLockout     = 15 * time.Minute
)

// dummyPinHash is spent on an unknown handle so that a miss costs what a
// comparison costs. It matches no PIN.
var dummyPinHash, _ = bcrypt.GenerateFromPassword([]byte("no-such-credential"), bcrypt.DefaultCost)

// Verify checks handle+PIN and returns the consumer ID on success.
//
// The attempt is CLAIMED on the account before the PIN is compared, in one
// statement that refuses a locked account: concurrent guesses each take a
// number, and after the fifth the rest find the lock. Reading the lock, then
// comparing, then counting would let every racing guess through (the defect
// the Business login had, A9-03). A correct PIN clears the count.
func (s *CredentialStore) Verify(ctx context.Context, handle, rawPin string) (string, error) {
	var row credentialRow
	err := s.pool.QueryRow(ctx,
		`UPDATE public_api_credentials
		    SET failed_attempts = failed_attempts + 1,
		        locked_until = CASE WHEN failed_attempts + 1 >= $2
		                            THEN now() + make_interval(mins => $3)
		                            ELSE locked_until END
		  WHERE handle = $1 AND (locked_until IS NULL OR locked_until <= now())
		  RETURNING consumer_id, handle, pin_hash`,
		handle, maxLoginAttempts, int(loginLockout.Minutes()),
	).Scan(&row.ConsumerID, &row.Handle, &row.PinHash)
	if errors.Is(err, pgx.ErrNoRows) {
		var exists bool
		if qerr := s.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM public_api_credentials WHERE handle = $1)`, handle,
		).Scan(&exists); qerr == nil && exists {
			return "", ErrCredentialsLocked
		}
		_ = bcrypt.CompareHashAndPassword(dummyPinHash, []byte(rawPin))
		return "", ErrInvalidCredentials
	}
	if err != nil {
		return "", fmt.Errorf("credential lookup: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(row.PinHash), []byte(rawPin)); err != nil {
		return "", ErrInvalidCredentials
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE public_api_credentials SET failed_attempts = 0, locked_until = NULL WHERE consumer_id = $1`,
		row.ConsumerID); err != nil {
		return "", fmt.Errorf("credential reset: %w", err)
	}
	return row.ConsumerID, nil
}

func isUniqueViolation(err error) bool {
	return err != nil && (contains(err.Error(), "23505") ||
		contains(err.Error(), "duplicate key"))
}
