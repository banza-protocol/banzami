package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrAdminUserNotFound = errors.New("admin user not found")
	ErrAdminUserExists   = errors.New("admin user already exists")
)

// AdminUser is an operator account. password_hash is never serialized to JSON
// and never returned by the API.
type AdminUser struct {
	ID                  string
	Email               string
	FullName            string
	PasswordHash        string
	Role                string
	Status              string
	LastLoginAt         *time.Time
	FailedLoginAttempts int
	LockedUntil         *time.Time
	TokenVersion        int
}

// Lockout policy.
const (
	MaxFailedLogins = 5
	LockoutWindow   = 15 * time.Minute
)

// IsLocked reports whether the account is currently locked.
func (u AdminUser) IsLocked(now time.Time) bool {
	return u.LockedUntil != nil && u.LockedUntil.After(now)
}

type AdminUserService struct {
	pool *pgxpool.Pool
}

func NewAdminUserService(pool *pgxpool.Pool) *AdminUserService {
	return &AdminUserService{pool: pool}
}

const adminUserCols = `id::text, email, full_name, COALESCE(password_hash,''), role, status,
	last_login_at, failed_login_attempts, locked_until, token_version`

func scanAdminUser(row pgx.Row) (AdminUser, error) {
	var u AdminUser
	err := row.Scan(&u.ID, &u.Email, &u.FullName, &u.PasswordHash, &u.Role, &u.Status,
		&u.LastLoginAt, &u.FailedLoginAttempts, &u.LockedUntil, &u.TokenVersion)
	return u, err
}

// GetByEmail looks up an operator case-insensitively.
func (s *AdminUserService) GetByEmail(ctx context.Context, email string) (AdminUser, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+adminUserCols+` FROM admin_users WHERE lower(email) = lower($1)`, email)
	u, err := scanAdminUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return AdminUser{}, ErrAdminUserNotFound
	}
	return u, err
}

// GetByID loads an operator by id (used by the middleware to re-check status).
func (s *AdminUserService) GetByID(ctx context.Context, id string) (AdminUser, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+adminUserCols+` FROM admin_users WHERE id = $1`, id)
	u, err := scanAdminUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return AdminUser{}, ErrAdminUserNotFound
	}
	return u, err
}

// TouchLastLogin records a successful login (best-effort).
func (s *AdminUserService) TouchLastLogin(ctx context.Context, id string) {
	_, _ = s.pool.Exec(ctx, `UPDATE admin_users SET last_login_at = now(), updated_at = now() WHERE id = $1`, id)
}

// UpdatePassword replaces an operator's bcrypt hash, records password_set_at,
// bumps updated_at, and increments token_version so that changing the password
// revokes every outstanding session for that operator.
func (s *AdminUserService) UpdatePassword(ctx context.Context, id, passwordHash string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE admin_users
		    SET password_hash = $2, password_set_at = now(),
		        token_version = token_version + 1, updated_at = now()
		  WHERE id = $1`, id, passwordHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAdminUserNotFound
	}
	return nil
}

// BumpTokenVersion increments token_version, immediately invalidating every
// outstanding session for the operator. Backs the "terminate all sessions"
// action (self-service and SUPER_ADMIN-initiated).
func (s *AdminUserService) BumpTokenVersion(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE admin_users SET token_version = token_version + 1, updated_at = now() WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAdminUserNotFound
	}
	return nil
}

// RecordFailedLogin increments the failure counter and, once MaxFailedLogins is
// reached, locks the account for LockoutWindow. Returns the resulting
// locked_until (nil if not locked).
func (s *AdminUserService) RecordFailedLogin(ctx context.Context, id string) (*time.Time, error) {
	var lockedUntil *time.Time
	err := s.pool.QueryRow(ctx,
		`UPDATE admin_users
		    SET failed_login_attempts = failed_login_attempts + 1,
		        locked_until = CASE WHEN failed_login_attempts + 1 >= $2
		                            THEN now() + make_interval(mins => $3)
		                            ELSE locked_until END,
		        updated_at = now()
		  WHERE id = $1
		  RETURNING locked_until`,
		id, MaxFailedLogins, int(LockoutWindow.Minutes())).Scan(&lockedUntil)
	return lockedUntil, err
}

// ResetLoginCountersAndTouch clears the failure counter + lock and records a
// successful login.
func (s *AdminUserService) ResetLoginCountersAndTouch(ctx context.Context, id string) {
	_, _ = s.pool.Exec(ctx,
		`UPDATE admin_users
		    SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now(), updated_at = now()
		  WHERE id = $1`, id)
}

// RecordLoginAttempt appends to the auditable login-attempt trail (no secrets).
func (s *AdminUserService) RecordLoginAttempt(ctx context.Context, emailNorm string, adminUserID *string, ip, userAgent string, success bool, failureReason string) {
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO admin_login_attempts (id, email_normalized, admin_user_id, ip, user_agent, success, failure_reason)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		uuid.NewString(), emailNorm, adminUserID, nullStr(ip), nullStr(userAgent), success, nullStr(failureReason))
}

// Create inserts a new operator (bootstrap). Fails if the email exists.
func (s *AdminUserService) Create(ctx context.Context, email, fullName, passwordHash, role string) (string, error) {
	id := uuid.NewString()
	// A password is not an enrolment.
	//
	// This wrote 'ACTIVE', which is how the very first operator came to exist as
	// an active SUPER_ADMIN with no second factor. The invite flow was corrected
	// to land in MFA_ENROLMENT_REQUIRED and this legacy path was not, so the one
	// route that creates a privileged identity with a credential attached was
	// also the one route that skipped the lifecycle. It is the route the first
	// operator on a new deployment goes through.
	_, err := s.pool.Exec(ctx,
		`INSERT INTO admin_users (id, email, full_name, password_hash, role, status)
		 VALUES ($1, $2, $3, $4, $5, 'MFA_ENROLMENT_REQUIRED')`,
		id, email, fullName, passwordHash, role)
	if err != nil {
		// 23505 = unique_violation
		if pgErr := pgConstraintCode(err); pgErr == "23505" {
			return "", ErrAdminUserExists
		}
		return "", err
	}
	return id, nil
}

// Exists reports whether an operator with this email already exists.
func (s *AdminUserService) Exists(ctx context.Context, email string) (bool, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM admin_users WHERE lower(email) = lower($1)`, email).Scan(&n)
	return n > 0, err
}
