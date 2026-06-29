package service

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Merchant app login (@handle + PIN). Separate from API keys, which remain the
// developer/integration credential.
var (
	ErrHandleInvalid        = errors.New("handle format is invalid")
	ErrPinInvalid           = errors.New("pin must be 4-8 digits")
	ErrHandleReserved       = errors.New("handle is reserved")
	ErrMerchantHandleTaken          = errors.New("handle is already taken")
	ErrMerchantCredsInvalid = errors.New("invalid handle or pin") // non-enumerating
	ErrMerchantLocked       = errors.New("too many attempts; try again later")
)

const (
	maxPinAttempts = 5
	// lockoutInterval is a Postgres interval literal applied after maxPinAttempts.
	lockoutInterval = "15 minutes"
)

// handleRe: 3-30 chars, lowercase, starts/ends alphanumeric, underscore allowed
// (no hyphen — matches merchant_profiles + consumer handle conventions).
var (
	handleRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$`)
	pinRe    = regexp.MustCompile(`^[0-9]{4,8}$`)
)

// ValidateHandle returns nil if the handle matches the global format rules.
func ValidateHandle(handle string) error {
	if !handleRe.MatchString(handle) {
		return ErrHandleInvalid
	}
	return nil
}

// ValidatePin returns nil if the PIN is 4-8 digits.
func ValidatePin(pin string) error {
	if !pinRe.MatchString(pin) {
		return ErrPinInvalid
	}
	return nil
}

// MerchantLookup is the non-secret result of a handle lookup used to decide
// whether the app should prompt for a PIN. It NEVER contains a PIN/hash/API key.
type MerchantLookup struct {
	Exists      bool
	CanLogin    bool
	Status      string // ACTIVE | SUSPENDED | CLOSED (merchant status)
	DisplayName string
	Verified    bool
	Activated   bool // false until the merchant sets a PIN via the activation link
	// OtherEnvironment is set ("LIVE"/"SANDBOX") only when the handle does NOT
	// exist in this stack but DOES exist in the other environment. It turns the
	// app's silent "conta não encontrada" into "esta conta pertence ao ambiente X"
	// (ADR-025). Empty in the normal case.
	OtherEnvironment string
}

// MerchantCredentialService authenticates a merchant by @handle + PIN, lets an
// already-authenticated merchant claim/update its handle + PIN, and exposes a
// non-secret handle lookup for the login UX.
type MerchantCredentialService interface {
	VerifyHandlePin(ctx context.Context, handle, pin string) (merchantID, environment string, err error)
	Claim(ctx context.Context, merchantID, environment, handle, pin string) error
	LookupHandle(ctx context.Context, handle string) (MerchantLookup, error)
}

type PostgresMerchantCredentialService struct {
	pool *pgxpool.Pool
	// crossPool is an optional read-only pool to the OTHER environment's database.
	// Used only to detect "this handle lives in the other environment" so login
	// can report it instead of a misleading not-found (ADR-025). otherEnvName is
	// the label of that environment ("LIVE"/"SANDBOX").
	crossPool   *pgxpool.Pool
	otherEnvName string
}

func NewPostgresMerchantCredentialService(pool *pgxpool.Pool) *PostgresMerchantCredentialService {
	return &PostgresMerchantCredentialService{pool: pool}
}

// WithCrossEnvLookup enables cross-environment handle detection for login UX. A
// nil pool is a no-op. The pool MUST be read-only (it is only ever SELECTed).
func (s *PostgresMerchantCredentialService) WithCrossEnvLookup(crossPool *pgxpool.Pool, otherEnvName string) *PostgresMerchantCredentialService {
	s.crossPool = crossPool
	s.otherEnvName = otherEnvName
	return s
}

// VerifyHandlePin checks the handle + PIN, applying a failed-attempt lockout.
// On invalid handle/pin it returns ErrMerchantCredsInvalid (non-enumerating);
// on too many failures it returns ErrMerchantLocked.
func (s *PostgresMerchantCredentialService) VerifyHandlePin(ctx context.Context, handle, pin string) (string, string, error) {
	handle = NormaliseHandle(handle)
	// Reject malformed input as plain invalid (don't reveal which field).
	if ValidateHandle(handle) != nil || ValidatePin(pin) != nil {
		return "", "", ErrMerchantCredsInvalid
	}

	var (
		merchantID  string
		environment string
		pinHash     *string // NULL until the merchant activates and sets a PIN
		activatedAt *time.Time
		locked      *time.Time
	)
	err := s.pool.QueryRow(ctx,
		`SELECT merchant_id::text, environment, pin_hash, activated_at, locked_until
		   FROM merchant_app_credentials
		  WHERE handle = $1`, handle).
		Scan(&merchantID, &environment, &pinHash, &activatedAt, &locked)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", ErrMerchantCredsInvalid
		}
		return "", "", err
	}

	// Not yet activated (no PIN set) → cannot log in (non-enumerating).
	if pinHash == nil || activatedAt == nil {
		return "", "", ErrMerchantCredsInvalid
	}

	if locked != nil && locked.After(time.Now()) {
		return "", "", ErrMerchantLocked
	}

	if bcrypt.CompareHashAndPassword([]byte(*pinHash), []byte(pin)) != nil {
		// Increment failures; lock once the threshold is reached.
		_, _ = s.pool.Exec(ctx,
			`UPDATE merchant_app_credentials
			    SET failed_attempts = failed_attempts + 1,
			        locked_until = CASE WHEN failed_attempts + 1 >= $2
			                            THEN now() + ($3)::interval
			                            ELSE locked_until END,
			        updated_at = now()
			  WHERE handle = $1`, handle, maxPinAttempts, lockoutInterval)
		return "", "", ErrMerchantCredsInvalid
	}

	// Success → reset the lockout counters.
	_, _ = s.pool.Exec(ctx,
		`UPDATE merchant_app_credentials
		    SET failed_attempts = 0, locked_until = NULL, updated_at = now()
		  WHERE handle = $1`, handle)
	return merchantID, environment, nil
}

// Claim sets/updates the @handle + PIN for an already-authenticated merchant.
// It reserves the handle in the global registry (rejecting reserved or
// consumer/other-merchant handles) and upserts the credential.
func (s *PostgresMerchantCredentialService) Claim(ctx context.Context, merchantID, environment, handle, pin string) error {
	handle = NormaliseHandle(handle)
	if err := ValidateHandle(handle); err != nil {
		return err
	}
	if err := ValidatePin(pin); err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Reserve the handle globally (or confirm this merchant already owns it).
	var (
		ownerType string
		ownerID   *string
		reserved  *string
	)
	scanErr := tx.QueryRow(ctx,
		`SELECT owner_type, owner_id::text, reserved_reason
		   FROM handle_registry WHERE handle = $1`, handle).
		Scan(&ownerType, &ownerID, &reserved)
	switch {
	case errors.Is(scanErr, pgx.ErrNoRows):
		if _, err := tx.Exec(ctx,
			`INSERT INTO handle_registry (handle, owner_type, owner_id)
			 VALUES ($1, 'MERCHANT', $2)`, handle, merchantID); err != nil {
			return err
		}
	case scanErr != nil:
		return scanErr
	default:
		if ownerType == "SYSTEM" || reserved != nil {
			return ErrHandleReserved
		}
		if ownerType != "MERCHANT" || ownerID == nil || *ownerID != merchantID {
			return ErrMerchantHandleTaken
		}
		// Already owned by this merchant — re-claim is allowed.
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO merchant_app_credentials (merchant_id, environment, handle, pin_hash)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (merchant_id, environment)
		 DO UPDATE SET handle = EXCLUDED.handle, pin_hash = EXCLUDED.pin_hash,
		               failed_attempts = 0, locked_until = NULL, updated_at = now()`,
		merchantID, environment, handle, string(hash)); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// LookupHandle reports whether a login handle exists and may sign in. It returns
// only non-secret data (status, display name, verified) — never a PIN/hash/key.
// A missing or malformed handle yields Exists=false (no enumeration of details).
func (s *PostgresMerchantCredentialService) LookupHandle(ctx context.Context, handle string) (MerchantLookup, error) {
	handle = NormaliseHandle(handle)
	if ValidateHandle(handle) != nil {
		return MerchantLookup{Exists: false, CanLogin: false}, nil
	}

	var (
		status      string
		verified    bool
		displayName string
		activated   bool
	)
	err := s.pool.QueryRow(ctx,
		`SELECT m.status, m.verified, COALESCE(p.display_name, m.name),
		        (c.activated_at IS NOT NULL) AS activated
		   FROM merchant_app_credentials c
		   JOIN merchants m          ON m.id = c.merchant_id
		   LEFT JOIN merchant_profiles p ON p.merchant_id = c.merchant_id
		  WHERE c.handle = $1`, handle).
		Scan(&status, &verified, &displayName, &activated)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Not here — is it in the other environment? If so, tell the app which
			// one, so it shows "esta conta pertence ao ambiente X" rather than a
			// silent not-found (the @jrm failure mode).
			return MerchantLookup{Exists: false, CanLogin: false, OtherEnvironment: s.lookupOtherEnv(ctx, handle)}, nil
		}
		return MerchantLookup{}, err
	}

	return MerchantLookup{
		Exists:      true,
		CanLogin:    status == "ACTIVE" && activated,
		Status:      status,
		DisplayName: displayName,
		Verified:    verified,
		Activated:   activated,
	}, nil
}

// lookupOtherEnv returns the other environment's label when the handle exists
// there, else "". Best-effort: any error (no cross pool, DB issue) yields "" so a
// lookup never fails because of the cross-environment probe.
func (s *PostgresMerchantCredentialService) lookupOtherEnv(ctx context.Context, handle string) string {
	if s.crossPool == nil {
		return ""
	}
	var one int
	err := s.crossPool.QueryRow(ctx,
		`SELECT 1 FROM merchant_app_credentials WHERE handle = $1`, handle).Scan(&one)
	if err != nil {
		return ""
	}
	return s.otherEnvName
}

func NormaliseHandle(handle string) string {
	return strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(handle), "@")))
}
