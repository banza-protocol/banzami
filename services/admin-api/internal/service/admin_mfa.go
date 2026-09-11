package service

// BANZADMIN second factors.
//
// A privileged operator must not reach a full session with a password alone.
// Everything the console can do — approve KYB, price a customer, suspend a
// business — is done in that operator's name, and a password is one reusable
// secret that leaves a copy wherever it is typed.
//
// Two things live here: a TOTP factor, and recovery codes for the day the
// authenticator is on a phone that is gone.

import (
	"context"
	"crypto/rand"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
)

// ErrMFANotEnrolled: no confirmed factor for this operator.
var ErrMFANotEnrolled = errors.New("no confirmed second factor")

// ErrMFACodeRejected: the code did not verify, or has already been used.
var ErrMFACodeRejected = errors.New("code rejected")

// ErrMFANothingToConfirm: the factor is already confirmed and no replacement is
// pending, so there is no new authenticator for a code to prove.
var ErrMFANothingToConfirm = errors.New("no enrolment or replacement is pending")

// MFAService owns operator second factors.
//
// The secret is encrypted at rest with the same construction the rest of the
// platform uses for secrets it must be able to read back. cipher may be nil in
// a sandbox, in which case the secret is stored as-is and the deployment says
// so at startup — the same trade the webhook secrets make.
type MFAService struct {
	pool   *pgxpool.Pool
	cipher SecretCipher
}

// SecretCipher is the encryption boundary, an interface so this package does
// not depend on which implementation a deployment wires in.
type SecretCipher interface {
	Encrypt(plaintext string) (string, error)
	Decrypt(stored string) (string, error)
}

func NewMFAService(pool *pgxpool.Pool, cipher SecretCipher) *MFAService {
	return &MFAService{pool: pool, cipher: cipher}
}

// MFAStatus is what the console may know about an operator's factors.
type MFAStatus struct {
	Enrolled          bool       `json:"enrolled"`
	ConfirmedAt       *time.Time `json:"confirmed_at,omitempty"`
	RecoveryCodesLeft int        `json:"recovery_codes_left"`
}

// Status reports whether the operator has a confirmed factor. Never the secret.
func (s *MFAService) Status(ctx context.Context, adminUserID string) (MFAStatus, error) {
	var confirmed *time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT confirmed_at FROM admin_mfa WHERE admin_user_id = $1`, adminUserID).Scan(&confirmed)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return MFAStatus{}, err
	}
	var left int
	_ = s.pool.QueryRow(ctx,
		`SELECT count(*) FROM admin_mfa_recovery_codes WHERE admin_user_id = $1 AND used_at IS NULL`,
		adminUserID).Scan(&left)
	return MFAStatus{Enrolled: confirmed != nil, ConfirmedAt: confirmed, RecoveryCodesLeft: left}, nil
}

// BeginEnrolment mints a secret and returns it with its provisioning URI.
//
// It replaces any UNCONFIRMED enrolment: someone who abandoned a setup halfway
// must be able to start again. It refuses to replace a CONFIRMED one, because
// that would let anyone holding a session silently swap the factor guarding it.
func (s *MFAService) BeginEnrolment(ctx context.Context, adminUserID, accountEmail string) (secret, uri string, err error) {
	return s.begin(ctx, adminUserID, accountEmail, false)
}

// BeginReplacement starts enrolling a new authenticator for an operator whose
// current one is going away, and it is deliberately a different entry point.
//
// The caller must have re-authenticated — password plus a current second
// factor. The confirmed factor is NOT touched: the new seed waits as pending,
// and every login keeps being challenged by the old factor until a code from
// the new authenticator confirms it (ConfirmEnrolment swaps them). It used to
// discard the confirmed factor at this point, and an abandoned replacement left
// an account whose password alone reached enrolment and then a full session
// (A5-01). There is still no state in which an operator has a password, no
// working second factor and a privileged session.
func (s *MFAService) BeginReplacement(ctx context.Context, adminUserID, accountEmail string) (secret, uri string, err error) {
	return s.begin(ctx, adminUserID, accountEmail, true)
}

func (s *MFAService) begin(ctx context.Context, adminUserID, accountEmail string, replacing bool) (secret, uri string, err error) {
	var confirmed *time.Time
	err = s.pool.QueryRow(ctx, `SELECT confirmed_at FROM admin_mfa WHERE admin_user_id = $1`, adminUserID).Scan(&confirmed)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", "", err
	}
	if confirmed != nil && !replacing {
		return "", "", errors.New("a confirmed second factor already exists")
	}

	secret, err = auth.NewTOTPSecret()
	if err != nil {
		return "", "", err
	}
	stored := secret
	if s.cipher != nil {
		if stored, err = s.cipher.Encrypt(secret); err != nil {
			return "", "", err
		}
	}
	if confirmed != nil {
		// A replacement: the new seed is pending, the confirmed one still guards.
		tag, err := s.pool.Exec(ctx,
			`UPDATE admin_mfa
			    SET pending_secret_encrypted = $2, pending_started_at = now(), updated_at = now()
			  WHERE admin_user_id = $1 AND confirmed_at IS NOT NULL`,
			adminUserID, stored)
		if err != nil {
			return "", "", err
		}
		if tag.RowsAffected() != 1 {
			return "", "", errors.New("the confirmed factor changed while the replacement started")
		}
		return secret, auth.TOTPProvisioningURI(secret, accountEmail, "BANZADMIN"), nil
	}
	tag, err := s.pool.Exec(ctx,
		`INSERT INTO admin_mfa (admin_user_id, secret_encrypted, confirmed_at, last_step)
		 VALUES ($1, $2, NULL, NULL)
		 ON CONFLICT (admin_user_id) DO UPDATE
		    SET secret_encrypted = EXCLUDED.secret_encrypted,
		        confirmed_at = NULL, last_step = NULL,
		        pending_secret_encrypted = NULL, pending_started_at = NULL, updated_at = now()
		  WHERE admin_mfa.confirmed_at IS NULL`,
		adminUserID, stored)
	if err != nil {
		return "", "", err
	}
	if tag.RowsAffected() != 1 {
		return "", "", errors.New("a confirmed second factor already exists")
	}
	return secret, auth.TOTPProvisioningURI(secret, accountEmail, "BANZADMIN"), nil
}

// ConfirmEnrolment verifies the first code and activates the factor, returning
// the recovery codes once.
//
// Requiring a code before the factor counts is what stops an operator locking
// themselves out of a console they are responsible for: an enrolment that was
// never proven does not gate anything.
func (s *MFAService) ConfirmEnrolment(ctx context.Context, adminUserID, code string) ([]string, error) {
	var stored string
	var pending *string
	var confirmed *time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT secret_encrypted, pending_secret_encrypted, confirmed_at FROM admin_mfa WHERE admin_user_id = $1`,
		adminUserID).Scan(&stored, &pending, &confirmed)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMFANotEnrolled
	}
	if err != nil {
		return nil, err
	}

	if confirmed == nil {
		// First enrolment: the code proves the only seed there is.
		secret, err := s.reveal(stored)
		if err != nil {
			return nil, err
		}
		step, ok := auth.VerifyTOTP(secret, code, time.Now())
		if !ok {
			return nil, ErrMFACodeRejected
		}
		tag, err := s.pool.Exec(ctx,
			`UPDATE admin_mfa SET confirmed_at = now(), last_step = $2, updated_at = now()
			  WHERE admin_user_id = $1 AND confirmed_at IS NULL AND secret_encrypted = $3`,
			adminUserID, step, stored)
		if err != nil {
			return nil, err
		}
		if tag.RowsAffected() != 1 {
			return nil, ErrMFACodeRejected
		}
		return s.regenerateRecoveryCodes(ctx, adminUserID)
	}

	// A replacement: the code must come from the NEW authenticator. Only then
	// does the pending seed become the factor, in one statement that also checks
	// nobody started a different replacement in between.
	if pending == nil {
		return nil, ErrMFANothingToConfirm
	}
	secret, err := s.reveal(*pending)
	if err != nil {
		return nil, err
	}
	step, ok := auth.VerifyTOTP(secret, code, time.Now())
	if !ok {
		return nil, ErrMFACodeRejected
	}
	tag, err := s.pool.Exec(ctx,
		`UPDATE admin_mfa
		    SET secret_encrypted = pending_secret_encrypted, confirmed_at = now(), last_step = $2,
		        pending_secret_encrypted = NULL, pending_started_at = NULL, updated_at = now()
		  WHERE admin_user_id = $1 AND pending_secret_encrypted = $3`,
		adminUserID, step, *pending)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() != 1 {
		return nil, ErrMFACodeRejected
	}
	return s.regenerateRecoveryCodes(ctx, adminUserID)
}

func (s *MFAService) reveal(stored string) (string, error) {
	if s.cipher == nil {
		return stored, nil
	}
	return s.cipher.Decrypt(stored)
}

// Verify checks a TOTP code, or a recovery code, and consumes what it used.
//
// Replay is the thing being prevented in both halves. A TOTP code is valid for
// a window, so accepting one twice inside that window makes it not one-time —
// the last accepted step is recorded and anything at or below it is refused. A
// recovery code is marked used in the same statement that selects it.
func (s *MFAService) Verify(ctx context.Context, adminUserID, code string) error {
	secret, lastStep, err := s.load(ctx, adminUserID)
	if err != nil {
		return err
	}
	if step, ok := auth.VerifyTOTP(secret, code, time.Now()); ok {
		if lastStep != nil && step <= *lastStep {
			return ErrMFACodeRejected // already used inside its window
		}
		// The step is claimed, not just written: two logins racing with the same
		// code both passed the read above, and an unconditional UPDATE let both
		// in. Only the one whose UPDATE moves last_step forward wins.
		tag, err := s.pool.Exec(ctx,
			`UPDATE admin_mfa SET last_step = $2, updated_at = now()
			  WHERE admin_user_id = $1 AND (last_step IS NULL OR last_step < $2)`,
			adminUserID, step)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return ErrMFACodeRejected
		}
		return nil
	}
	return s.consumeRecoveryCode(ctx, adminUserID, code)
}

// VerifyForReauthentication checks a second factor WITHOUT consuming a TOTP
// step, for an operation that is re-proving identity rather than logging in.
//
// A recovery code IS still consumed: it is one-time by definition, and letting
// a re-authentication reuse one would make it many-time. A TOTP step is not
// recorded, because the operator is about to be asked for another code in the
// same minute and refusing their own current code would be indistinguishable
// from a broken authenticator.
func (s *MFAService) VerifyForReauthentication(ctx context.Context, adminUserID, code string) error {
	secret, _, err := s.load(ctx, adminUserID)
	if err != nil {
		return err
	}
	if _, ok := auth.VerifyTOTP(secret, code, time.Now()); ok {
		return nil
	}
	return s.consumeRecoveryCode(ctx, adminUserID, code)
}

// Reset removes an operator's factor and their recovery codes.
//
// The caller audits it. This is the lock-out escape hatch and it is deliberately
// blunt: after it, the operator has no second factor and must enrol again before
// they can hold a session.
func (s *MFAService) Reset(ctx context.Context, adminUserID string) error {
	if _, err := s.pool.Exec(ctx, `DELETE FROM admin_mfa WHERE admin_user_id = $1`, adminUserID); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `DELETE FROM admin_mfa_recovery_codes WHERE admin_user_id = $1`, adminUserID)
	return err
}

// RegenerateRecoveryCodes issues a fresh set and invalidates the old ones.
func (s *MFAService) RegenerateRecoveryCodes(ctx context.Context, adminUserID string) ([]string, error) {
	if _, err := s.Status(ctx, adminUserID); err != nil {
		return nil, err
	}
	return s.regenerateRecoveryCodes(ctx, adminUserID)
}

// EncryptStoredSecrets rewrites any TOTP seed still stored in plaintext under
// the configured key, and returns how many it moved. A seed written before the
// deployment had a key stays readable (an unprefixed value passes through the
// cipher) — but it also stays in the clear in every database dump until
// something rewrites it. Each row is replaced only while it still holds the
// plaintext just read, so a concurrent enrolment is never overwritten.
func (s *MFAService) EncryptStoredSecrets(ctx context.Context) (int, error) {
	if s.cipher == nil {
		return 0, nil
	}
	moved := 0
	for _, col := range []string{"secret_encrypted", "pending_secret_encrypted"} {
		rows, err := s.pool.Query(ctx,
			`SELECT admin_user_id::text, `+col+` FROM admin_mfa
			  WHERE `+col+` IS NOT NULL AND `+col+` NOT LIKE 'enc:v1:%'`)
		if err != nil {
			return moved, err
		}
		type plain struct{ id, value string }
		var todo []plain
		for rows.Next() {
			var p plain
			if err := rows.Scan(&p.id, &p.value); err != nil {
				rows.Close()
				return moved, err
			}
			todo = append(todo, p)
		}
		rows.Close()
		for _, p := range todo {
			enc, err := s.cipher.Encrypt(p.value)
			if err != nil {
				return moved, err
			}
			tag, err := s.pool.Exec(ctx,
				`UPDATE admin_mfa SET `+col+` = $2, updated_at = now()
				  WHERE admin_user_id = $1 AND `+col+` = $3`, p.id, enc, p.value)
			if err != nil {
				return moved, err
			}
			moved += int(tag.RowsAffected())
		}
	}
	return moved, nil
}

// ── internals ───────────────────────────────────────────────────────────────

func (s *MFAService) load(ctx context.Context, adminUserID string) (secret string, lastStep *int64, err error) {
	var stored string
	err = s.pool.QueryRow(ctx,
		`SELECT secret_encrypted, last_step FROM admin_mfa WHERE admin_user_id = $1`,
		adminUserID).Scan(&stored, &lastStep)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, ErrMFANotEnrolled
	}
	if err != nil {
		return "", nil, err
	}
	if s.cipher != nil {
		if secret, err = s.cipher.Decrypt(stored); err != nil {
			return "", nil, err
		}
		return secret, lastStep, nil
	}
	return stored, lastStep, nil
}

func (s *MFAService) regenerateRecoveryCodes(ctx context.Context, adminUserID string) ([]string, error) {
	if _, err := s.pool.Exec(ctx, `DELETE FROM admin_mfa_recovery_codes WHERE admin_user_id = $1`, adminUserID); err != nil {
		return nil, err
	}
	out := make([]string, 0, 10)
	for i := 0; i < 10; i++ {
		c, err := newRecoveryCode()
		if err != nil {
			return nil, err
		}
		h, err := bcrypt.GenerateFromPassword([]byte(c), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		if _, err := s.pool.Exec(ctx,
			`INSERT INTO admin_mfa_recovery_codes (admin_user_id, code_hash) VALUES ($1, $2)`,
			adminUserID, string(h)); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

func (s *MFAService) consumeRecoveryCode(ctx context.Context, adminUserID, code string) error {
	code = strings.ToLower(strings.TrimSpace(code))
	// Only something shaped like a recovery code is compared. Every refused TOTP
	// guess used to fall through to up to ten bcrypt comparisons — CPU an
	// attacker spends nothing to make us burn (A5-02).
	if !recoveryCodeShape.MatchString(code) {
		return ErrMFACodeRejected
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, code_hash FROM admin_mfa_recovery_codes
		  WHERE admin_user_id = $1 AND used_at IS NULL`, adminUserID)
	if err != nil {
		return err
	}
	type cand struct{ id, hash string }
	var cands []cand
	for rows.Next() {
		var c cand
		if err := rows.Scan(&c.id, &c.hash); err != nil {
			rows.Close()
			return err
		}
		cands = append(cands, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, c := range cands {
		if bcrypt.CompareHashAndPassword([]byte(c.hash), []byte(code)) != nil {
			continue
		}
		// Mark used in a statement that only matches while it is still unused,
		// so two concurrent attempts cannot both succeed.
		tag, err := s.pool.Exec(ctx,
			`UPDATE admin_mfa_recovery_codes SET used_at = now()
			  WHERE id = $1 AND used_at IS NULL`, c.id)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrMFACodeRejected
		}
		return nil
	}
	return ErrMFACodeRejected
}

// recoveryCodeShape is exactly what newRecoveryCode produces.
var recoveryCodeShape = regexp.MustCompile(`^[abcdefghjkmnpqrstuvwxyz23456789]{5}-[abcdefghjkmnpqrstuvwxyz23456789]{5}$`)

// newRecoveryCode returns a code in the shape people can read off paper:
// lowercase, unambiguous alphabet, grouped.
func newRecoveryCode() (string, error) {
	const alphabet = "abcdefghjkmnpqrstuvwxyz23456789" // no i/l/o/0/1
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	out := make([]byte, 0, 11)
	for i, v := range b {
		if i == 5 {
			out = append(out, '-')
		}
		out = append(out, alphabet[int(v)%len(alphabet)])
	}
	return string(out), nil
}
