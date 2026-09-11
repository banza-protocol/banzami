package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
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
	ErrMerchantHandleTaken  = errors.New("handle is already taken")
	ErrMerchantCredsInvalid = errors.New("invalid handle or pin") // non-enumerating
	// ErrHandleOwnerMismatch is still ErrMerchantCredsInvalid to every caller
	// that answers the person (same non-enumerating 401); it is distinct only so
	// the operator's metrics can tell a data defect from a wrong PIN.
	ErrHandleOwnerMismatch = fmt.Errorf("%w: credential does not belong to the handle's owner", ErrMerchantCredsInvalid)
	ErrMerchantLocked      = errors.New("too many attempts; try again later")
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

// MerchantCredentialService authenticates a merchant by @handle + PIN and
// exposes a non-secret handle lookup for the login UX. The PIN itself is set
// only by activation (activation.go).
type MerchantCredentialService interface {
	VerifyHandlePin(ctx context.Context, handle, pin string) (merchantID, environment string, err error)
	LookupHandle(ctx context.Context, handle string) (MerchantLookup, error)
}

type PostgresMerchantCredentialService struct {
	pool *pgxpool.Pool
	// crossPool is an optional read-only pool to the OTHER environment's database.
	// Used only to detect "this handle lives in the other environment" so login
	// can report it instead of a misleading not-found (ADR-025). otherEnvName is
	// the label of that environment ("LIVE"/"SANDBOX").
	crossPool    *pgxpool.Pool
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
		merchantID     string
		environment    string
		pinHash        *string // NULL until the merchant activates and sets a PIN
		activatedAt    *time.Time
		locked         *time.Time
		merchantStatus string
		ownsHandle     bool
	)
	// The merchant's status is joined in, not looked up afterwards, because it
	// is part of whether this credential may sign in at all — not a detail to
	// check once the token has already been issued.
	err := s.pool.QueryRow(ctx,
		`SELECT c.merchant_id::text, c.environment, c.pin_hash, c.activated_at, c.locked_until,
		        COALESCE(m.status, ''),
		        EXISTS (SELECT 1 FROM handle_registry hr
		                 WHERE hr.handle = c.handle AND hr.owner_type = 'MERCHANT'
		                   AND hr.owner_id = c.merchant_id)
		   FROM merchant_app_credentials c
		   LEFT JOIN merchants m ON m.id = c.merchant_id
		  WHERE c.handle = $1`, handle).
		Scan(&merchantID, &environment, &pinHash, &activatedAt, &locked, &merchantStatus, &ownsHandle)
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

	// A suspended merchant must not be able to sign in to the merchant app.
	//
	// It could. Suspension changed the merchant row and nothing else, while this
	// query never looked at it, so a handle and PIN issued before the suspension
	// still returned a full session token. Suspension is the operator's canonical
	// way to retire a merchant — including every disposable merchant an E2E
	// harness creates — and a retirement that leaves a working login is not a
	// retirement. Same non-enumerating 401 as a wrong PIN.
	if merchantStatus != "" && merchantStatus != "ACTIVE" {
		return "", "", ErrMerchantCredsInvalid
	}

	// The credential signs in as the owner of its handle, or not at all.
	//
	// The handle is what the person typed and what the app shows; the registry
	// says who owns it. A credential still pointing at a previous owner (a
	// handle that moved without its login) would issue a session for a
	// different Business Account than the one the handle, its Developer Project
	// and its funds belong to — the app would show @handle and read someone
	// else's wallet. Refused, loudly in the log, with the same non-enumerating
	// 401 as a wrong PIN; migration 0117 repairs the data.
	if !ownsHandle {
		slog.ErrorContext(ctx, "merchant.auth.handle_owner_mismatch", "environment", environment)
		return "", "", ErrHandleOwnerMismatch
	}

	if locked != nil && locked.After(time.Now()) {
		return "", "", ErrMerchantLocked
	}

	// Claim the attempt BEFORE comparing the PIN, in a statement that refuses a
	// locked credential. The lock used to be read above, the PIN compared, and
	// the failure counted afterwards: concurrent guesses all read "unlocked" and
	// were all compared — 300 of 300 in a race, where five was the limit (A9-03).
	// The counter write's error was discarded too, so a failed write was a free
	// guess (A2-18); a claim that cannot be written refuses the attempt.
	var claimed int
	err = s.pool.QueryRow(ctx,
		`UPDATE merchant_app_credentials
		    SET failed_attempts = failed_attempts + 1,
		        locked_until = CASE WHEN failed_attempts + 1 >= $2
		                            THEN now() + ($3)::interval
		                            ELSE locked_until END,
		        updated_at = now()
		  WHERE handle = $1 AND (locked_until IS NULL OR locked_until <= now())
		  RETURNING 1`, handle, maxPinAttempts, lockoutInterval).Scan(&claimed)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", ErrMerchantLocked
	}
	if err != nil {
		return "", "", err
	}

	if bcrypt.CompareHashAndPassword([]byte(*pinHash), []byte(pin)) != nil {
		return "", "", ErrMerchantCredsInvalid
	}

	// Success → clear the count the claim added.
	if _, err := s.pool.Exec(ctx,
		`UPDATE merchant_app_credentials
		    SET failed_attempts = 0, locked_until = NULL, updated_at = now()
		  WHERE handle = $1`, handle); err != nil {
		return "", "", err
	}
	return merchantID, environment, nil
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
