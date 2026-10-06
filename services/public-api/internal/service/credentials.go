package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
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

// ErrTestPayerSignIn: the credentials belong to a Sandbox test payer, which acts
// only through its Project's API (ADR-060 §4). A session would let it pay any
// Business and send to any consumer with test value.
var ErrTestPayerSignIn = errors.New("a Sandbox test payer does not sign in")

// ErrHandleAlreadyRegistered is returned when the handle is taken.
var ErrHandleAlreadyRegistered = errors.New("handle already registered")

// CredentialStore persists consumer PIN hashes in public_api_credentials.
// It is the only table owned by this service — all financial data lives in core.
type CredentialStore struct {
	pool     *pgxpool.Pool
	sessions sync.Map // consumer id → sessionEntry (see SessionValid)
	// confineTestPayers refuses a session to a Sandbox test payer (set in the
	// Sandbox, where sandbox_test_payers exists; LIVE has no test payers).
	confineTestPayers bool
}

// ConfineTestPayers makes sign-in and every session check refuse a Sandbox
// test payer. A test payer pays only through POST /v1/sandbox/test-payers/{id}/
// payments, where the gateway names the payee as the Project's own Business;
// a consumer session would reach every Business and consumer in the Sandbox.
func (s *CredentialStore) ConfineTestPayers() { s.confineTestPayers = true }

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

// ErrPinRecoveryRequired: three wrong PINs on a trusted device have disabled PIN
// login for this credential. Time does not clear it and even the correct PIN is
// refused — only identity recovery (Forgot-PIN) restores access. The consumer
// stays ACTIVE (credential state, not a lifecycle change).
var ErrPinRecoveryRequired = errors.New("pin recovery required")

// PinAttemptError is a wrong-PIN failure on a TRUSTED device for a real account.
// It carries how many attempts remain before PIN recovery is required, so the
// client can show it. Unknown handles and untrusted sources use the generic
// ErrInvalidCredentials instead — their count is never disclosed (anti-enumeration).
type PinAttemptError struct{ Remaining int }

func (e *PinAttemptError) Error() string { return "invalid pin" }

// PIN brute-force policy (credential state, never consumer lifecycle). On a
// TRUSTED device the 1st/2nd/3rd wrong PIN takes failed_attempts to 1/2/3; the
// recoveryThreshold-th failure sets PIN_RECOVERY_REQUIRED at once — persistent,
// recovery-only, with no temporary lock. A quiet gap beyond escalationWindow (and
// any correct PIN) resets the counter. An untrusted source never drives this
// state (anti-DoS); it is governed only by the handler's per-source throttle.
const (
	recoveryThreshold = 3
	escalationWindow  = 1 * time.Hour
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
	return s.VerifyWithDevice(ctx, handle, rawPin, "")
}

// VerifyWithDevice is Verify with the caller's device identifier (the SDK's
// X-Device-Id). The device matters only for the credential policy: the persistent
// PIN_RECOVERY_REQUIRED state is set only when the failing requests come from a
// device that has previously signed into THIS account (a trusted device). An
// unknown/remote source that merely knows a public @banza never moves the global
// counter or the recovery state (anti-DoS) — the handler's per-source throttle
// governs it. A successful sign-in records the device as trusted.
func (s *CredentialStore) VerifyWithDevice(ctx context.Context, handle, rawPin, deviceID string) (string, int, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", 0, fmt.Errorf("credential lookup: %w", err)
	}
	defer tx.Rollback(ctx)

	var (
		consumerID, pinHash string
		tokenVersion        int
		failedAttempts      int
		lastFailedAt        *time.Time
		recoveryRequired    *time.Time
	)
	err = tx.QueryRow(ctx,
		`SELECT consumer_id, pin_hash, token_version, failed_attempts,
		        last_failed_at, pin_recovery_required_at
		   FROM public_api_credentials WHERE handle = $1 FOR UPDATE`, handle).
		Scan(&consumerID, &pinHash, &tokenVersion, &failedAttempts,
			&lastFailedAt, &recoveryRequired)
	if errors.Is(err, pgx.ErrNoRows) {
		// Unknown handle: spend a compare so a miss costs what a hit costs.
		_ = bcrypt.CompareHashAndPassword(dummyPinHash, []byte(rawPin))
		return "", 0, ErrInvalidCredentials
	}
	if err != nil {
		return "", 0, fmt.Errorf("credential lookup: %w", err)
	}

	now := time.Now()
	// PIN_RECOVERY_REQUIRED disables PIN login entirely — even the correct PIN —
	// until identity recovery clears it. Time never clears it.
	if recoveryRequired != nil {
		return "", 0, ErrPinRecoveryRequired
	}

	// A quiet period beyond the window starts a fresh sequence, so an occasional
	// typo long after the fact never accumulates toward recovery.
	if lastFailedAt == nil || lastFailedAt.Before(now.Add(-escalationWindow)) {
		failedAttempts = 0
	}

	if bcrypt.CompareHashAndPassword([]byte(pinHash), []byte(rawPin)) == nil {
		// Correct PIN before the third failure: clear the counter.
		if _, err := tx.Exec(ctx,
			`UPDATE public_api_credentials
			    SET failed_attempts = 0, last_failed_at = NULL
			  WHERE consumer_id = $1`, consumerID); err != nil {
			return "", 0, fmt.Errorf("credential reset: %w", err)
		}
		if err := tx.Commit(ctx); err != nil {
			return "", 0, fmt.Errorf("credential reset: %w", err)
		}
		// Record this device as trusted for the account (best-effort): future
		// brute-force escalation from it may reach recovery-required; an unknown
		// device never can.
		s.recordTrustedDevice(ctx, consumerID, deviceID)
		// The right PIN opens no session for a consumer who is not ACTIVE.
		var status string
		if err := s.pool.QueryRow(ctx, `SELECT status FROM consumers WHERE id = $1`, consumerID).Scan(&status); err != nil {
			return "", 0, fmt.Errorf("consumer status: %w", err)
		}
		if status != "ACTIVE" {
			return "", 0, ErrConsumerNotActive
		}
		if s.confineTestPayers {
			var testPayer bool
			if err := s.pool.QueryRow(ctx,
				`SELECT EXISTS (SELECT 1 FROM sandbox_test_payers WHERE consumer_id = $1)`, consumerID,
			).Scan(&testPayer); err != nil {
				return "", 0, fmt.Errorf("test payer check: %w", err)
			}
			if testPayer {
				return "", 0, ErrTestPayerSignIn
			}
		}
		return consumerID, tokenVersion, nil
	}

	// Wrong PIN. The GLOBAL credential state (failed_attempts / lock_count /
	// locked_until / pin_recovery_required_at) is the TRUSTED-context policy and
	// must never be driven by an untrusted source — otherwise an attacker who
	// merely knows a public @banza could hold the victim's credential locked
	// (DoS). So an untrusted failure changes NOTHING here; the handler's separate
	// untrusted throttle (per source / per target / per source+target) governs it.
	trusted := deviceID != "" && s.deviceTrustedTx(ctx, tx, consumerID, deviceID)
	if !trusted {
		// No global mutation (defer rolls back the row lock). Non-enumerating.
		return "", 0, ErrInvalidCredentials
	}

	// Trusted-context policy: 1st/2nd/3rd wrong → failed_attempts 1/2/3. The third
	// failure sets PIN_RECOVERY_REQUIRED at once — no temporary lock, no second
	// sequence. The whole transition is one atomic UPDATE under the row lock taken
	// above (FOR UPDATE), so concurrent guesses cannot lose an increment or slip a
	// fourth attempt past the boundary.
	failedAttempts++
	var newRecovery *time.Time
	if failedAttempts >= recoveryThreshold {
		newRecovery = &now
	}
	if _, err := tx.Exec(ctx,
		`UPDATE public_api_credentials
		    SET failed_attempts = $2, last_failed_at = $3, pin_recovery_required_at = $4
		  WHERE consumer_id = $1`,
		consumerID, failedAttempts, now, newRecovery); err != nil {
		return "", 0, fmt.Errorf("credential attempt: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", 0, fmt.Errorf("credential attempt: %w", err)
	}
	if newRecovery != nil {
		// A single security notification may follow (dedup/cooldown owned by the
		// notifier); never with the PIN, OTP, reset token or attacker detail.
		_ = s.WriteAudit(ctx, consumerID, "PIN_RECOVERY_REQUIRED", consumerID, nil)
		return "", 0, ErrPinRecoveryRequired
	}
	// Wrong but not yet locked: tell the client how many attempts remain.
	return "", 0, &PinAttemptError{Remaining: recoveryThreshold - failedAttempts}
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
	query := `SELECT pac.token_version, c.status = 'ACTIVE'
		   FROM public_api_credentials pac JOIN consumers c ON c.id = pac.consumer_id
		  WHERE pac.consumer_id = $1`
	if s.confineTestPayers {
		// A token a test payer obtained before sign-in was refused is not a session.
		query = `SELECT pac.token_version, c.status = 'ACTIVE'
		          AND NOT EXISTS (SELECT 1 FROM sandbox_test_payers tp WHERE tp.consumer_id = c.id)
		   FROM public_api_credentials pac JOIN consumers c ON c.id = pac.consumer_id
		  WHERE pac.consumer_id = $1`
	}
	err := s.pool.QueryRow(ctx, query, consumerID).Scan(&e.version, &e.active)
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

// CurrentTokenVersion reads the consumer's current session version, so a
// Change-PIN can revoke every old session (bump) and then re-mint a token for
// the current device at the new version.
func (s *CredentialStore) CurrentTokenVersion(ctx context.Context, consumerID string) (int, error) {
	var v int
	err := s.pool.QueryRow(ctx,
		`SELECT token_version FROM public_api_credentials WHERE consumer_id = $1`, consumerID).Scan(&v)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrInvalidCredentials
	}
	if err != nil {
		return 0, fmt.Errorf("token version: %w", err)
	}
	return v, nil
}

// VerifyPinByID re-verifies a consumer's PIN by id, for a fresh re-auth on a
// high-impact action (account deletion). The id comes from the authenticated
// session, never from the client. It issues no token and does not touch the
// lockout counters; it only confirms the PIN over the already-authenticated,
// TLS-protected request.
func (s *CredentialStore) VerifyPinByID(ctx context.Context, consumerID, rawPin string) error {
	var pinHash string
	err := s.pool.QueryRow(ctx,
		`SELECT pin_hash FROM public_api_credentials WHERE consumer_id = $1`,
		consumerID).Scan(&pinHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidCredentials
	}
	if err != nil {
		return fmt.Errorf("credential lookup: %w", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(pinHash), []byte(rawPin)); err != nil {
		return ErrInvalidCredentials
	}
	return nil
}

// UpdatePin overwrites the consumer's PIN hash and clears the lockout counters.
// It is the credential write shared by "Alterar PIN" (authenticated) and
// "Esqueci o PIN" (after a verified reset grant). It does NOT revoke sessions —
// the caller decides the session policy (change = re-mint this one; reset =
// revoke all) via RevokeSessions.
func (s *CredentialStore) UpdatePin(ctx context.Context, consumerID, newRawPin string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newRawPin), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("bcrypt: %w", err)
	}
	ct, err := s.pool.Exec(ctx,
		`UPDATE public_api_credentials
		    SET pin_hash = $2, failed_attempts = 0,
		        last_failed_at = NULL, pin_recovery_required_at = NULL
		  WHERE consumer_id = $1`,
		consumerID, string(hash))
	if err != nil {
		return fmt.Errorf("credential pin update: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrInvalidCredentials
	}
	return nil
}

// ResetTarget is the non-secret result of a forgot-PIN eligibility lookup.
type ResetTarget struct {
	ConsumerID string
	Email      string // the account's verified email (lower-cased)
	Eligible   bool   // ACTIVE and has a verified email
}

// LookupResetTarget resolves a handle to its consumer for the forgot-PIN flow.
// It returns Eligible only when the account is ACTIVE and carries a verified
// email. It NEVER errors on "not found" / "not eligible" — it returns a zero
// ResetTarget so the public handler can give one generic, non-enumerating
// answer regardless. A real store failure is still an error (outage, not a no).
func (s *CredentialStore) LookupResetTarget(ctx context.Context, handle string) (ResetTarget, error) {
	var (
		consumerID string
		email      *string
		status     string
	)
	err := s.pool.QueryRow(ctx,
		`SELECT pac.consumer_id, c.email, c.status
		   FROM public_api_credentials pac JOIN consumers c ON c.id = pac.consumer_id
		  WHERE pac.handle = $1`, handle).Scan(&consumerID, &email, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ResetTarget{}, nil
	}
	if err != nil {
		return ResetTarget{}, fmt.Errorf("reset target lookup: %w", err)
	}
	if status != "ACTIVE" || email == nil || *email == "" {
		// Known account, but not eligible (suspended/closed, or no verified email).
		// Non-enumerating: same zero result as not-found.
		return ResetTarget{}, nil
	}
	return ResetTarget{ConsumerID: consumerID, Email: *email, Eligible: true}, nil
}

// ConsumerByEmail resolves a verified email to its live (non-CLOSED) consumer,
// returning the id and status. Used by register's retry-safe resume: on a
// HANDLE_TAKEN/EMAIL_TAKEN from a prior attempt, the consumer that already holds
// the verified email is the one this registration was creating. Returns found
// false when no non-CLOSED consumer holds the email.
func (s *CredentialStore) ConsumerByEmail(ctx context.Context, email string) (id, status string, found bool, err error) {
	e := strings.ToLower(strings.TrimSpace(email))
	qerr := s.pool.QueryRow(ctx,
		`SELECT id::text, status FROM consumers
		  WHERE lower(email) = $1 AND status != 'CLOSED' LIMIT 1`, e).Scan(&id, &status)
	if errors.Is(qerr, pgx.ErrNoRows) {
		return "", "", false, nil
	}
	if qerr != nil {
		return "", "", false, fmt.Errorf("consumer by email: %w", qerr)
	}
	return id, status, true, nil
}

// ConsumerEmail returns the account's verified email (lower-cased), or "" when
// it has none. Used only to address a security-notice email; never exposed to a
// caller as account data.
func (s *CredentialStore) ConsumerEmail(ctx context.Context, consumerID string) (string, error) {
	var email *string
	err := s.pool.QueryRow(ctx, `SELECT email FROM consumers WHERE id = $1`, consumerID).Scan(&email)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("consumer email: %w", err)
	}
	if email == nil {
		return "", nil
	}
	return *email, nil
}

// StatusActive reports whether a consumer is ACTIVE. Used by the reset-confirm
// path to re-assert, at the last moment, that a CLOSED/SUSPENDED account is
// never revived by a reset even if a grant was issued earlier.
func (s *CredentialStore) StatusActive(ctx context.Context, consumerID string) (bool, error) {
	var status string
	err := s.pool.QueryRow(ctx, `SELECT status FROM consumers WHERE id = $1`, consumerID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("consumer status: %w", err)
	}
	return status == "ACTIVE", nil
}

// DeleteCredential removes this service's credential for a deleted account: the
// PIN hash and the login handle are gone, so no future sign-in can succeed and
// every existing session fails validation (the row the check joins is gone).
// The consumer row itself stays as a CLOSED tombstone in core (financial truth).
func (s *CredentialStore) DeleteCredential(ctx context.Context, consumerID string) error {
	if _, err := s.pool.Exec(ctx,
		`DELETE FROM public_api_credentials WHERE consumer_id = $1`,
		consumerID); err != nil {
		return fmt.Errorf("credential delete: %w", err)
	}
	s.sessions.Delete(consumerID)
	return nil
}

// WriteAudit appends one row to the append-only audit_log (0099 immutability
// triggers forbid UPDATE/DELETE). public-api holds INSERT authority on audit_log
// via the manifest. metadata is stored as JSONB; it must never contain a PIN,
// code, token or other secret. A failure is returned so the caller can log it,
// but audit is written AFTER the state change it records, so a failed audit
// never rolls back the action (it is logged for reconciliation).
func (s *CredentialStore) WriteAudit(ctx context.Context, actor, action, subject string, metadata []byte) error {
	if len(metadata) == 0 {
		metadata = []byte("{}")
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO audit_log (actor, action, subject, metadata) VALUES ($1, $2, $3, $4)`,
		actor, action, subject, metadata)
	if err != nil {
		return fmt.Errorf("audit write: %w", err)
	}
	return nil
}

// hashDevice is the consumer_devices convention: SHA-256 of the client-supplied
// device id (the raw id is never stored).
func hashDevice(deviceID string) string {
	sum := sha256.Sum256([]byte(deviceID))
	return hex.EncodeToString(sum[:])
}

// deviceTrustedTx reports whether a device has previously signed into this
// account (recorded in consumer_devices). A trusted device is the only context
// in which brute-force may escalate to the persistent recovery-required state.
func (s *CredentialStore) deviceTrustedTx(ctx context.Context, tx pgx.Tx, consumerID, deviceID string) bool {
	if deviceID == "" {
		return false
	}
	var ok bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM consumer_devices WHERE consumer_id = $1 AND device_hash = $2)`,
		consumerID, hashDevice(deviceID)).Scan(&ok); err != nil {
		return false // fail-closed: unknown ⇒ not trusted ⇒ no persistent escalation
	}
	return ok
}

// ConsumerIDByHandle resolves a handle to its consumer id for keying the
// per-target untrusted throttle. Empty + false for an unknown handle
// (non-enumerating: the caller still answers generically).
func (s *CredentialStore) ConsumerIDByHandle(ctx context.Context, handle string) (string, bool) {
	var id string
	err := s.pool.QueryRow(ctx, `SELECT consumer_id::text FROM public_api_credentials WHERE handle = $1`, handle).Scan(&id)
	if err != nil {
		return "", false
	}
	return id, true
}

// IsTrustedDevice reports whether deviceID is a device that previously signed
// into the account behind handle (recorded in consumer_devices). A client cannot
// self-declare trust: an arbitrary/new X-Device-Id is UNKNOWN until a successful
// authenticated session records it. Non-enumerating: an unknown handle or device
// simply returns false. Used by the login handler to decide whether the source
// throttle applies (a trusted device is governed by the account policy, an
// unknown source by the throttle).
func (s *CredentialStore) IsTrustedDevice(ctx context.Context, handle, deviceID string) bool {
	if deviceID == "" || handle == "" {
		return false
	}
	var ok bool
	if err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (
		    SELECT 1 FROM public_api_credentials c
		      JOIN consumer_devices d ON d.consumer_id = c.consumer_id
		     WHERE c.handle = $1 AND d.device_hash = $2)`,
		handle, hashDevice(deviceID)).Scan(&ok); err != nil {
		return false // fail-closed: treat as untrusted
	}
	return ok
}

// recordTrustedDevice marks a device as seen for the account on a successful
// sign-in (best-effort, idempotent). Only the hash is stored.
func (s *CredentialStore) recordTrustedDevice(ctx context.Context, consumerID, deviceID string) {
	if deviceID == "" {
		return
	}
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO consumer_devices (consumer_id, device_hash, first_seen_at, last_seen_at)
		 VALUES ($1, $2, now(), now())
		 ON CONFLICT (consumer_id, device_hash) DO UPDATE SET last_seen_at = now()`,
		consumerID, hashDevice(deviceID))
}

func isUniqueViolation(err error) bool {
	return err != nil && (contains(err.Error(), "23505") ||
		contains(err.Error(), "duplicate key"))
}
