package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Token purposes + TTLs.
const (
	PurposeInvite = "INVITE"
	PurposeReset  = "PASSWORD_RESET"
	inviteTTL     = 72 * time.Hour
	resetTTL      = 24 * time.Hour
)

// Reset/invite validation reasons.
const (
	ResetValid   = "VALID"
	ResetExpired = "EXPIRED"
	ResetUsed    = "USED"
	ResetInvalid = "INVALID"
)

// ResetTokenInfo is the result of validating a reset token (no secrets).
type ResetTokenInfo struct {
	Reason      string
	AdminUserID string
	FullName    string
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// createToken generates a single-use 256-bit token of a given purpose, stores
// only its sha256 hash, invalidates the operator's prior unused tokens of that
// purpose, and returns the RAW token (caller emails it; never logged).
func (s *AdminUserService) createToken(ctx context.Context, adminUserID, purpose string, ttl time.Duration, createdBy string) (string, time.Time, error) {
	if _, err := s.GetByID(ctx, adminUserID); err != nil {
		return "", time.Time{}, err
	}
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", time.Time{}, err
	}
	raw := hex.EncodeToString(b[:])
	expiresAt := time.Now().Add(ttl)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", time.Time{}, err
	}
	defer tx.Rollback(ctx)
	// Invalidate any still-unused token of the same purpose.
	if _, err := tx.Exec(ctx,
		`UPDATE admin_password_reset_tokens SET used_at = now()
		  WHERE admin_user_id = $1 AND purpose = $2 AND used_at IS NULL`,
		adminUserID, purpose); err != nil {
		return "", time.Time{}, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO admin_password_reset_tokens (id, admin_user_id, token_hash, purpose, expires_at, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		uuid.NewString(), adminUserID, hashToken(raw), purpose, expiresAt, nullStr(createdBy)); err != nil {
		return "", time.Time{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", time.Time{}, err
	}
	return raw, expiresAt, nil
}

// CreateInviteToken issues a 72h INVITE link for a new operator.
func (s *AdminUserService) CreateInviteToken(ctx context.Context, adminUserID, createdBy string) (string, time.Time, error) {
	return s.createToken(ctx, adminUserID, PurposeInvite, inviteTTL, createdBy)
}

// CreateResetToken issues a 24h PASSWORD_RESET link.
func (s *AdminUserService) CreateResetToken(ctx context.Context, adminUserID, createdBy string) (string, time.Time, error) {
	return s.createToken(ctx, adminUserID, PurposeReset, resetTTL, createdBy)
}

// ValidateResetToken reports whether a raw token is usable.
func (s *AdminUserService) ValidateResetToken(ctx context.Context, raw string) (ResetTokenInfo, error) {
	if raw == "" {
		return ResetTokenInfo{Reason: ResetInvalid}, nil
	}
	var (
		adminUserID string
		fullName    string
		expiresAt   time.Time
		usedAt      *time.Time
	)
	err := s.pool.QueryRow(ctx,
		`SELECT t.admin_user_id::text, u.full_name, t.expires_at, t.used_at
		   FROM admin_password_reset_tokens t
		   JOIN admin_users u ON u.id = t.admin_user_id
		  WHERE t.token_hash = $1`, hashToken(raw)).Scan(&adminUserID, &fullName, &expiresAt, &usedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ResetTokenInfo{Reason: ResetInvalid}, nil
	}
	if err != nil {
		return ResetTokenInfo{}, err
	}
	switch {
	case usedAt != nil:
		return ResetTokenInfo{Reason: ResetUsed}, nil
	case expiresAt.Before(time.Now()):
		return ResetTokenInfo{Reason: ResetExpired}, nil
	}
	return ResetTokenInfo{Reason: ResetValid, AdminUserID: adminUserID, FullName: fullName}, nil
}

// ResetCompletion is the audit-friendly outcome of CompleteReset. On the
// non-success branches (USED/EXPIRED/INVALID) only Reason is set. On success it
// carries the target operator's identity plus a before/after snapshot — all
// non-secret fields (never the password, hash or token).
type ResetCompletion struct {
	Reason             string
	Purpose            string // INVITE | PASSWORD_RESET
	AdminUserID        string
	Email              string
	FullName           string
	Role               string
	BeforeStatus       string
	AfterStatus        string
	BeforePasswordSet  bool
	BeforeTokenVersion int
	AfterTokenVersion  int
	ActivatedAt        *time.Time
}

// CompleteReset consumes a valid token and sets the new password hash. It clears
// the lockout, bumps token_version, marks the token used, all atomically, and
// returns a redacted before/after snapshot for auditing. Reason == ResetValid on
// the success path.
func (s *AdminUserService) CompleteReset(ctx context.Context, raw, passwordHash string) (ResetCompletion, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ResetCompletion{}, err
	}
	defer tx.Rollback(ctx)

	var (
		tokenID     string
		adminUserID string
		purpose     string
		expiresAt   time.Time
		usedAt      *time.Time
	)
	err = tx.QueryRow(ctx,
		`SELECT id::text, admin_user_id::text, purpose, expires_at, used_at
		   FROM admin_password_reset_tokens WHERE token_hash = $1 FOR UPDATE`, hashToken(raw)).
		Scan(&tokenID, &adminUserID, &purpose, &expiresAt, &usedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ResetCompletion{Reason: ResetInvalid}, nil
	}
	if err != nil {
		return ResetCompletion{}, err
	}
	if usedAt != nil {
		return ResetCompletion{Reason: ResetUsed}, nil
	}
	if expiresAt.Before(time.Now()) {
		return ResetCompletion{Reason: ResetExpired}, nil
	}

	// Capture the before-state (identity + status + token_version) for the audit
	// snapshot. No secret columns are read.
	out := ResetCompletion{Reason: ResetValid, Purpose: purpose, AdminUserID: adminUserID}
	if err := tx.QueryRow(ctx,
		`SELECT email, full_name, role, status, (password_hash IS NOT NULL), token_version
		   FROM admin_users WHERE id=$1`, adminUserID).
		Scan(&out.Email, &out.FullName, &out.Role, &out.BeforeStatus, &out.BeforePasswordSet, &out.BeforeTokenVersion); err != nil {
		return ResetCompletion{}, err
	}

	// INVITE completion activates the account; PASSWORD_RESET only sets the
	// password (a SUSPENDED operator stays suspended — never auto-reactivated).
	// token_version is bumped in both branches so completing an invite or a reset
	// revokes any session minted before the password was (re)set. RETURNING gives
	// the exact after-state for the audit snapshot.
	if purpose == PurposeInvite {
		if err := tx.QueryRow(ctx,
			`UPDATE admin_users
			    SET password_hash=$2, password_set_at=now(), activated_at=now(),
			        -- Completing an invite sets a password. It does NOT make the
			        -- account active: a privileged identity is active only once it
			        -- also has a confirmed second factor and acknowledged recovery
			        -- codes. This used to write 'ACTIVE' here, which made the word
			        -- mean "has a password" and left the real guarantee living in
			        -- a branch inside the login handler instead of in the state.
			        status = CASE WHEN status='INVITED' THEN 'MFA_ENROLMENT_REQUIRED' ELSE status END,
			        token_version = token_version + 1,
			        failed_login_attempts=0, locked_until=NULL, updated_at=now()
			  WHERE id=$1
			  RETURNING status, token_version, activated_at`, adminUserID, passwordHash).
			Scan(&out.AfterStatus, &out.AfterTokenVersion, &out.ActivatedAt); err != nil {
			return ResetCompletion{}, err
		}
	} else if err := tx.QueryRow(ctx,
		`UPDATE admin_users
		    SET password_hash=$2, password_set_at=now(), failed_login_attempts=0,
		        token_version = token_version + 1,
		        locked_until=NULL, updated_at=now()
		  WHERE id=$1
		  RETURNING status, token_version, activated_at`, adminUserID, passwordHash).
		Scan(&out.AfterStatus, &out.AfterTokenVersion, &out.ActivatedAt); err != nil {
		return ResetCompletion{}, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE admin_password_reset_tokens SET used_at=now() WHERE id=$1`, tokenID); err != nil {
		return ResetCompletion{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ResetCompletion{}, err
	}
	return out, nil
}
