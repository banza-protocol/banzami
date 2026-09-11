package service

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// ErrInvalidCredentials is returned when handle+PIN do not match.
var ErrInvalidCredentials = errors.New("invalid handle or PIN")

// ErrConsumerNotActive: the PIN was right, but the consumer is not ACTIVE
// (suspended or closed), so no session is issued.
var ErrConsumerNotActive = errors.New("consumer is not active")

// ErrHandleAlreadyRegistered is returned when the handle is taken.
var ErrHandleAlreadyRegistered = errors.New("handle already registered")

// CredentialStore persists consumer PIN hashes in public_api_credentials.
// It is the only table owned by this service — all financial data lives in core.
type CredentialStore struct {
	pool     *pgxpool.Pool
	sessions sync.Map // consumer id → sessionEntry (see SessionValid)
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
func (s *CredentialStore) Verify(ctx context.Context, handle, rawPin string) (string, int, error) {
	var row credentialRow
	var tokenVersion int
	err := s.pool.QueryRow(ctx,
		`UPDATE public_api_credentials
		    SET failed_attempts = failed_attempts + 1,
		        locked_until = CASE WHEN failed_attempts + 1 >= $2
		                            THEN now() + make_interval(mins => $3)
		                            ELSE locked_until END
		  WHERE handle = $1 AND (locked_until IS NULL OR locked_until <= now())
		  RETURNING consumer_id, handle, pin_hash, token_version`,
		handle, maxLoginAttempts, int(loginLockout.Minutes()),
	).Scan(&row.ConsumerID, &row.Handle, &row.PinHash, &tokenVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		var exists bool
		if qerr := s.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM public_api_credentials WHERE handle = $1)`, handle,
		).Scan(&exists); qerr != nil {
			// An unreadable store is an outage, not a wrong PIN.
			return "", 0, fmt.Errorf("credential lookup: %w", qerr)
		} else if exists {
			return "", 0, ErrCredentialsLocked
		}
		_ = bcrypt.CompareHashAndPassword(dummyPinHash, []byte(rawPin))
		return "", 0, ErrInvalidCredentials
	}
	if err != nil {
		return "", 0, fmt.Errorf("credential lookup: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(row.PinHash), []byte(rawPin)); err != nil {
		return "", 0, ErrInvalidCredentials
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE public_api_credentials SET failed_attempts = 0, locked_until = NULL WHERE consumer_id = $1`,
		row.ConsumerID); err != nil {
		return "", 0, fmt.Errorf("credential reset: %w", err)
	}
	// The right PIN opens no session for a consumer who is not ACTIVE.
	var status string
	if err := s.pool.QueryRow(ctx, `SELECT status FROM consumers WHERE id = $1`, row.ConsumerID).Scan(&status); err != nil {
		return "", 0, fmt.Errorf("consumer status: %w", err)
	}
	if status != "ACTIVE" {
		return "", 0, ErrConsumerNotActive
	}
	return row.ConsumerID, tokenVersion, nil
}

// sessionCacheTTL bounds how long a session check is reused within this
// process. A sign-out on this instance takes effect at once (the entry is
// dropped); a suspension, or a sign-out through another instance, within this.
const sessionCacheTTL = 10 * time.Second

type sessionEntry struct {
	version int
	active  bool
	at      time.Time
}

// SessionValid says whether a consumer token is still good: the consumer is
// ACTIVE and the token carries the current session version. A store that
// cannot be read is an error, never a yes.
func (s *CredentialStore) SessionValid(ctx context.Context, consumerID string, tokenVersion int) (bool, error) {
	if v, ok := s.sessions.Load(consumerID); ok {
		e := v.(sessionEntry)
		if time.Since(e.at) < sessionCacheTTL {
			return e.active && e.version == tokenVersion, nil
		}
	}
	var e sessionEntry
	err := s.pool.QueryRow(ctx,
		`SELECT pac.token_version, c.status = 'ACTIVE'
		   FROM public_api_credentials pac JOIN consumers c ON c.id = pac.consumer_id
		  WHERE pac.consumer_id = $1`, consumerID,
	).Scan(&e.version, &e.active)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("session check: %w", err)
	}
	e.at = time.Now()
	s.sessions.Store(consumerID, e)
	return e.active && e.version == tokenVersion, nil
}

// RevokeSessions ends every session the consumer holds: tokens issued under
// the current version stop being accepted.
func (s *CredentialStore) RevokeSessions(ctx context.Context, consumerID string) error {
	if _, err := s.pool.Exec(ctx,
		`UPDATE public_api_credentials SET token_version = token_version + 1 WHERE consumer_id = $1`,
		consumerID); err != nil {
		return fmt.Errorf("session revoke: %w", err)
	}
	s.sessions.Delete(consumerID)
	return nil
}

func isUniqueViolation(err error) bool {
	return err != nil && (contains(err.Error(), "23505") ||
		contains(err.Error(), "duplicate key"))
}
