package service

// Consumer verified-email + PIN-recovery machinery (public-api owned).
//
// Login stays @handle + PIN. This adds email as a verified contact + recovery
// channel, and the two flows that need it:
//
//   - signup email verification: an OTP proves control of the email BEFORE the
//     account exists; a correct code yields an opaque EMAIL_VERIFIED grant that
//     register() consumes to create the consumer with a verified email.
//   - forgot-PIN: an OTP to the account's own verified email yields an opaque
//     PIN_RESET grant bound to that consumer; set-new-PIN consumes it.
//
// The OTP is NEVER the reset token — a separate opaque single-use grant is. Only
// hashes are stored (HMAC-SHA-256 with a pepper never written to Postgres). All
// codes/tokens are single-use, short-lived, attempt-capped, and replaced on
// re-request (one live per subject). Nothing here is ever logged or returned by
// a production endpoint.

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	// ErrRecoveryUnavailable: the recovery subsystem is not configured (no
	// pepper) or its store could not answer. Never answered as a refusal.
	ErrRecoveryUnavailable = errors.New("consumer recovery unavailable")
	// ErrRecoveryOtpInvalid: wrong, expired, unknown or already-used code. Non-enumerating.
	ErrRecoveryOtpInvalid = errors.New("invalid or expired code")
	// ErrRecoveryOtpLocked: too many wrong codes for this subject.
	ErrRecoveryOtpLocked = errors.New("too many attempts; request a new code")
	// ErrGrantInvalid: a verification/reset grant that is unknown, expired, used
	// or does not match. Non-enumerating.
	ErrGrantInvalid = errors.New("invalid or expired authorization")
	// ErrOtpCooldown: a code for this subject was issued very recently.
	ErrOtpCooldown = errors.New("a code was just sent; wait before requesting another")
	// ErrOtpTooMany: too many codes issued for this subject in the window.
	ErrOtpTooMany = errors.New("too many codes requested; try again later")
)

const (
	recoveryOTPTTL   = 10 * time.Minute
	recoveryGrantTTL = 15 * time.Minute
	recoveryMaxOTP   = 5
	// Persistent (DB-backed) issuance controls — survive restarts and span
	// instances, unlike the per-IP in-process limiter. Per subject (email for
	// signup, consumer for reset): a resend cooldown and a cap on codes issued
	// within a window.
	recoveryResendCooldown = 60 * time.Second
	recoveryIssueWindow    = 15 * time.Minute
	recoveryMaxPerWindow   = 5
)

// checkIssuePolicy enforces the persistent per-subject resend cooldown and the
// per-window issuance cap. subjectClause is a SQL predicate binding $2 to the
// subject (e.g. "lower(email) = lower($2)" or "consumer_id = $2"). It counts ALL
// rows (consumed or not) created in the window, so superseding a code does not
// reset the abuse budget. DB-backed, so it survives restarts and spans instances.
func (s *ConsumerRecoveryService) checkIssuePolicy(ctx context.Context, purpose, subjectClause string, subject any) error {
	var (
		cnt  int
		last *time.Time
	)
	q := `SELECT count(*), max(created_at) FROM consumer_email_otps
	       WHERE purpose = $1 AND ` + subjectClause + ` AND created_at > now() - ($3)::interval`
	window := recoveryIssueWindow.String()
	if err := s.pool.QueryRow(ctx, q, purpose, subject, window).Scan(&cnt, &last); err != nil {
		return fmt.Errorf("%w: issue policy: %w", ErrRecoveryUnavailable, err)
	}
	if last != nil && s.now().Sub(*last) < recoveryResendCooldown {
		return ErrOtpCooldown
	}
	if cnt >= recoveryMaxPerWindow {
		return ErrOtpTooMany
	}
	return nil
}

// ConsumerRecoveryService stores and verifies the OTPs and grants. Nil when no
// pepper is configured (the routes are then not mounted — fail-closed).
type ConsumerRecoveryService struct {
	pool   *pgxpool.Pool
	pepper string
	now    func() time.Time
}

func NewConsumerRecoveryService(pool *pgxpool.Pool, pepper string) *ConsumerRecoveryService {
	if pool == nil || strings.TrimSpace(pepper) == "" {
		return nil
	}
	return &ConsumerRecoveryService{pool: pool, pepper: pepper, now: time.Now}
}

func (s *ConsumerRecoveryService) hashCode(code string) string {
	mac := hmac.New(sha256.New, []byte(s.pepper))
	mac.Write([]byte(code))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *ConsumerRecoveryService) hashToken(raw string) string {
	mac := hmac.New(sha256.New, []byte(s.pepper))
	mac.Write([]byte("grant:" + raw))
	return hex.EncodeToString(mac.Sum(nil))
}

func newNumericOTP() (string, error) {
	var b strings.Builder
	b.Grow(6)
	for i := 0; i < 6; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		b.WriteByte(byte('0' + n.Int64()))
	}
	return b.String(), nil
}

func newGrantToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// ── Signup email verification ───────────────────────────────────────────────

// RequestSignupOtp issues (and emails, via the handler) a code proving control
// of a signup email. email must be lower-cased by the caller. A re-request
// replaces any live code for that email.
func (s *ConsumerRecoveryService) RequestSignupOtp(ctx context.Context, email, ip string) (string, error) {
	if err := s.checkIssuePolicy(ctx, "SIGNUP_VERIFY", "lower(email) = lower($2)", email); err != nil {
		return "", err
	}
	code, err := newNumericOTP()
	if err != nil {
		return "", fmt.Errorf("%w: code: %w", ErrRecoveryUnavailable, err)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("%w: begin: %w", ErrRecoveryUnavailable, err)
	}
	defer tx.Rollback(ctx)
	// Replace any live signup code for this email (respects the one-live index).
	if _, err := tx.Exec(ctx,
		`UPDATE consumer_email_otps SET consumed_at = now(), updated_at = now()
		  WHERE purpose = 'SIGNUP_VERIFY' AND lower(email) = lower($1) AND consumed_at IS NULL`,
		email); err != nil {
		return "", fmt.Errorf("%w: supersede: %w", ErrRecoveryUnavailable, err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO consumer_email_otps (id, purpose, email, code_hash, expires_at, request_ip)
		 VALUES ($1, 'SIGNUP_VERIFY', $2, $3, $4, $5)`,
		uuid.NewString(), email, s.hashCode(code), s.now().Add(recoveryOTPTTL), nullable(ip)); err != nil {
		return "", fmt.Errorf("%w: insert: %w", ErrRecoveryUnavailable, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("%w: commit: %w", ErrRecoveryUnavailable, err)
	}
	return code, nil
}

// VerifySignupOtp checks the code for an email and, on success, returns a raw
// EMAIL_VERIFIED grant token (its hash is stored). register() consumes it.
func (s *ConsumerRecoveryService) VerifySignupOtp(ctx context.Context, email, code string) (string, error) {
	if err := s.consumeOtp(ctx,
		`SELECT id, code_hash, expires_at, attempts, max_attempts FROM consumer_email_otps
		   WHERE purpose = 'SIGNUP_VERIFY' AND lower(email) = lower($1) AND consumed_at IS NULL
		   ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, email, code); err != nil {
		return "", err
	}
	token, err := newGrantToken()
	if err != nil {
		return "", fmt.Errorf("%w: token: %w", ErrRecoveryUnavailable, err)
	}
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO consumer_auth_grants (id, kind, token_hash, email, expires_at)
		 VALUES ($1, 'EMAIL_VERIFIED', $2, lower($3), $4)`,
		uuid.NewString(), s.hashToken(token), email, s.now().Add(recoveryGrantTTL)); err != nil {
		return "", fmt.Errorf("%w: grant: %w", ErrRecoveryUnavailable, err)
	}
	return token, nil
}

// CheckEmailVerificationGrantLive validates that token is a live EMAIL_VERIFIED
// grant for email WITHOUT consuming it. register() calls this at the start so a
// transient failure during account creation leaves the grant usable for a retry
// of the SAME registration; the grant is only consumed once creation succeeds.
// The "1 verified email = 1 live Consumer" unique index is what guarantees the
// grant can never create a second identity, so leaving it live across a retry is
// safe. A replay after the grant is consumed (post-success) fails here.
func (s *ConsumerRecoveryService) CheckEmailVerificationGrantLive(ctx context.Context, token, email string) error {
	var ok bool
	err := s.pool.QueryRow(ctx,
		`SELECT true FROM consumer_auth_grants
		  WHERE kind = 'EMAIL_VERIFIED' AND token_hash = $1 AND lower(email) = lower($2)
		    AND consumed_at IS NULL AND expires_at > now()`,
		s.hashToken(token), email).Scan(&ok)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrGrantInvalid
	}
	if err != nil {
		return fmt.Errorf("%w: check grant: %w", ErrRecoveryUnavailable, err)
	}
	return nil
}

// ConsumeEmailVerificationGrant validates that token is a live EMAIL_VERIFIED
// grant for email and marks it used. Single-use: a replay fails. Called by
// register() AFTER account creation succeeds.
func (s *ConsumerRecoveryService) ConsumeEmailVerificationGrant(ctx context.Context, token, email string) error {
	ct, err := s.pool.Exec(ctx,
		`UPDATE consumer_auth_grants SET consumed_at = now()
		  WHERE kind = 'EMAIL_VERIFIED' AND token_hash = $1 AND lower(email) = lower($2)
		    AND consumed_at IS NULL AND expires_at > now()`,
		s.hashToken(token), email)
	if err != nil {
		return fmt.Errorf("%w: consume: %w", ErrRecoveryUnavailable, err)
	}
	if ct.RowsAffected() == 0 {
		return ErrGrantInvalid
	}
	return nil
}

// ── Forgot PIN ────────────────────────────────────────────────────────────

// RequestPinResetOtp issues a reset code bound to a consumer, delivered to that
// account's own verified email. The caller resolves the consumer + email after
// an anti-enumeration check; this only stores + returns the code.
func (s *ConsumerRecoveryService) RequestPinResetOtp(ctx context.Context, consumerID, email, ip string) (string, error) {
	if err := s.checkIssuePolicy(ctx, "PIN_RESET", "consumer_id = $2", consumerID); err != nil {
		return "", err
	}
	code, err := newNumericOTP()
	if err != nil {
		return "", fmt.Errorf("%w: code: %w", ErrRecoveryUnavailable, err)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("%w: begin: %w", ErrRecoveryUnavailable, err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx,
		`UPDATE consumer_email_otps SET consumed_at = now(), updated_at = now()
		  WHERE purpose = 'PIN_RESET' AND consumer_id = $1 AND consumed_at IS NULL`,
		consumerID); err != nil {
		return "", fmt.Errorf("%w: supersede: %w", ErrRecoveryUnavailable, err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO consumer_email_otps (id, purpose, email, consumer_id, code_hash, expires_at, request_ip)
		 VALUES ($1, 'PIN_RESET', $2, $3, $4, $5, $6)`,
		uuid.NewString(), email, consumerID, s.hashCode(code), s.now().Add(recoveryOTPTTL), nullable(ip)); err != nil {
		return "", fmt.Errorf("%w: insert: %w", ErrRecoveryUnavailable, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("%w: commit: %w", ErrRecoveryUnavailable, err)
	}
	return code, nil
}

// VerifyPinResetOtp checks a reset code for a consumer and returns a raw
// PIN_RESET grant token bound to that consumer.
func (s *ConsumerRecoveryService) VerifyPinResetOtp(ctx context.Context, consumerID, code string) (string, error) {
	if err := s.consumeOtp(ctx,
		`SELECT id, code_hash, expires_at, attempts, max_attempts FROM consumer_email_otps
		   WHERE purpose = 'PIN_RESET' AND consumer_id = $1 AND consumed_at IS NULL
		   ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, consumerID, code); err != nil {
		return "", err
	}
	token, err := newGrantToken()
	if err != nil {
		return "", fmt.Errorf("%w: token: %w", ErrRecoveryUnavailable, err)
	}
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO consumer_auth_grants (id, kind, token_hash, consumer_id, expires_at)
		 VALUES ($1, 'PIN_RESET', $2, $3, $4)`,
		uuid.NewString(), s.hashToken(token), consumerID, s.now().Add(recoveryGrantTTL)); err != nil {
		return "", fmt.Errorf("%w: grant: %w", ErrRecoveryUnavailable, err)
	}
	return token, nil
}

// ConsumePinResetGrant validates + single-use consumes a PIN_RESET grant and
// returns its consumer id. It also invalidates any other pending reset grants
// and reset OTPs for that consumer, so one reset authorization yields exactly
// one PIN change. The caller then updates the credential + revokes sessions.
func (s *ConsumerRecoveryService) ConsumePinResetGrant(ctx context.Context, token string) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("%w: begin: %w", ErrRecoveryUnavailable, err)
	}
	defer tx.Rollback(ctx)
	var consumerID string
	err = tx.QueryRow(ctx,
		`UPDATE consumer_auth_grants SET consumed_at = now()
		  WHERE kind = 'PIN_RESET' AND token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
		  RETURNING consumer_id::text`, s.hashToken(token)).Scan(&consumerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrGrantInvalid
	}
	if err != nil {
		return "", fmt.Errorf("%w: consume: %w", ErrRecoveryUnavailable, err)
	}
	// Burn any other pending reset material for this consumer (defence in depth).
	if _, err := tx.Exec(ctx,
		`UPDATE consumer_auth_grants SET consumed_at = now()
		  WHERE kind = 'PIN_RESET' AND consumer_id = $1 AND consumed_at IS NULL`, consumerID); err != nil {
		return "", fmt.Errorf("%w: burn grants: %w", ErrRecoveryUnavailable, err)
	}
	if _, err := tx.Exec(ctx,
		`UPDATE consumer_email_otps SET consumed_at = now(), updated_at = now()
		  WHERE purpose = 'PIN_RESET' AND consumer_id = $1 AND consumed_at IS NULL`, consumerID); err != nil {
		return "", fmt.Errorf("%w: burn otps: %w", ErrRecoveryUnavailable, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("%w: commit: %w", ErrRecoveryUnavailable, err)
	}
	return consumerID, nil
}

// consumeOtp claims an attempt, compares the code in constant time, and on a
// match marks the OTP consumed. It owns its own transaction so the claimed
// attempt is COMMITTED even when the code is wrong (a caller-shared tx would
// roll the increment back on the returned error, making every wrong code free).
// The query selects the live OTP FOR UPDATE and binds the subject via $1 only;
// the code is compared in Go. Non-enumerating: ErrRecoveryOtpInvalid / ErrRecoveryOtpLocked.
func (s *ConsumerRecoveryService) consumeOtp(ctx context.Context, selectSQL, subject, code string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("%w: begin: %w", ErrRecoveryUnavailable, err)
	}
	defer tx.Rollback(ctx)

	var (
		id       string
		codeHash string
		expires  time.Time
		attempts int
		maxAtt   int
	)
	err = tx.QueryRow(ctx, selectSQL, subject).Scan(&id, &codeHash, &expires, &attempts, &maxAtt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrRecoveryOtpInvalid
	}
	if err != nil {
		return fmt.Errorf("%w: read: %w", ErrRecoveryUnavailable, err)
	}
	if attempts >= maxAtt {
		return ErrRecoveryOtpLocked
	}
	if !s.now().Before(expires) {
		return ErrRecoveryOtpInvalid
	}
	// Claim the attempt before comparing, and commit it whatever the comparison
	// yields.
	if _, err := tx.Exec(ctx,
		`UPDATE consumer_email_otps SET attempts = attempts + 1, updated_at = now() WHERE id = $1`, id); err != nil {
		return fmt.Errorf("%w: claim: %w", ErrRecoveryUnavailable, err)
	}
	match := len(code) == 6 && subtle.ConstantTimeCompare([]byte(s.hashCode(code)), []byte(codeHash)) == 1
	if match {
		if _, err := tx.Exec(ctx,
			`UPDATE consumer_email_otps SET consumed_at = now(), updated_at = now() WHERE id = $1`, id); err != nil {
			return fmt.Errorf("%w: consume: %w", ErrRecoveryUnavailable, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("%w: commit: %w", ErrRecoveryUnavailable, err)
	}
	if !match {
		return ErrRecoveryOtpInvalid
	}
	return nil
}

func nullable(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}
