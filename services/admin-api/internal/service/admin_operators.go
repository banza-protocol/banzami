package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// OperatorView is the admin-facing projection of an operator. It never includes
// the password hash. PasswordSet reports whether the operator can log in yet.
type OperatorView struct {
	ID          string     `json:"id"`
	Email       string     `json:"email"`
	FullName    string     `json:"full_name"`
	Role        string     `json:"role"`
	Status      string     `json:"status"`
	LastLoginAt *time.Time `json:"last_login_at"`
	LockedUntil *time.Time `json:"locked_until"`
	PasswordSet bool       `json:"password_set"`
	InvitedAt   *time.Time `json:"invited_at"`
	ActivatedAt *time.Time `json:"activated_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

var ValidRoles = map[string]bool{
	"SUPER_ADMIN": true, "OPERATIONS": true, "COMPLIANCE": true, "SUPPORT": true, "READ_ONLY": true,
}

const operatorCols = `id::text, email, full_name, role, status, last_login_at, locked_until,
	(password_hash IS NOT NULL) AS password_set, invited_at, activated_at, created_at`

func scanOperator(row pgx.Row) (OperatorView, error) {
	var o OperatorView
	err := row.Scan(&o.ID, &o.Email, &o.FullName, &o.Role, &o.Status, &o.LastLoginAt,
		&o.LockedUntil, &o.PasswordSet, &o.InvitedAt, &o.ActivatedAt, &o.CreatedAt)
	return o, err
}

func (s *AdminUserService) ListOperators(ctx context.Context) ([]OperatorView, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+operatorCols+` FROM admin_users ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []OperatorView{}
	for rows.Next() {
		o, err := scanOperator(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (s *AdminUserService) GetOperator(ctx context.Context, id string) (OperatorView, error) {
	o, err := scanOperator(s.pool.QueryRow(ctx, `SELECT `+operatorCols+` FROM admin_users WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return OperatorView{}, ErrAdminUserNotFound
	}
	return o, err
}

// CreateOperator inserts an INVITED operator WITHOUT a password. They cannot log
// in until they set a password via the INVITE link (which activates the account).
func (s *AdminUserService) CreateOperator(ctx context.Context, email, fullName, role, createdBy string) (string, error) {
	id := uuid.NewString()
	_, err := s.pool.Exec(ctx,
		`INSERT INTO admin_users (id, email, full_name, role, status, invited_at, created_by, updated_by)
		 VALUES ($1, $2, $3, $4, 'INVITED', now(), $5, $5)`,
		id, email, fullName, role, nullStr(createdBy))
	if err != nil {
		if pgConstraintCode(err) == "23505" {
			return "", ErrAdminUserExists
		}
		return "", err
	}
	return id, nil
}

func (s *AdminUserService) UpdateOperatorName(ctx context.Context, id, fullName, updatedBy string) error {
	return s.execOperator(ctx, `UPDATE admin_users SET full_name=$2, updated_by=$3, updated_at=now() WHERE id=$1`, id, fullName, nullStr(updatedBy))
}

func (s *AdminUserService) SetOperatorRole(ctx context.Context, id, role, updatedBy string) error {
	return s.execOperatorKeepingASuperAdmin(ctx, `UPDATE admin_users SET role=$2, updated_by=$3, updated_at=now() WHERE id=$1`, id, role, nullStr(updatedBy))
}

// SetOperatorStatus also clears the lock when re-activating and increments
// token_version so a suspend (or re-activate) immediately revokes any sessions
// the operator still holds.
func (s *AdminUserService) SetOperatorStatus(ctx context.Context, id, status, updatedBy string) error {
	return s.execOperatorKeepingASuperAdmin(ctx,
		`UPDATE admin_users
		    SET status=$2, updated_by=$3, updated_at=now(),
		        token_version = token_version + 1,
		        failed_login_attempts = CASE WHEN $2='ACTIVE' THEN 0 ELSE failed_login_attempts END,
		        locked_until = CASE WHEN $2='ACTIVE' THEN NULL ELSE locked_until END
		  WHERE id=$1`, id, status, nullStr(updatedBy))
}

// ErrLastSuperAdmin: the change would leave no SUPER_ADMIN who is not suspended.
var ErrLastSuperAdmin = errors.New("the last active SUPER_ADMIN cannot be demoted or suspended")

// execOperatorKeepingASuperAdmin applies a role or status change and refuses it
// if it took the number of non-suspended SUPER_ADMINs from one or more to zero.
//
// The handlers count first and change second, in separate statements: two
// SUPER_ADMINs suspending each other at the same moment both counted two and
// both succeeded, leaving nobody who can administer the console. Here the
// change and the recount run in one transaction, and one such transaction at a
// time.
func (s *AdminUserService) execOperatorKeepingASuperAdmin(ctx context.Context, sql, id string, args ...any) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('admin_users:super_admin_guard', 0))`); err != nil {
		return err
	}
	count := func() (int, error) {
		var n int
		err := tx.QueryRow(ctx, `SELECT count(*) FROM admin_users WHERE `+superAdminWhoCanAdminister).Scan(&n)
		return n, err
	}
	before, err := count()
	if err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, sql, append([]any{id}, args...)...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAdminUserNotFound
	}
	after, err := count()
	if err != nil {
		return err
	}
	if before > 0 && after == 0 {
		return ErrLastSuperAdmin
	}
	return tx.Commit(ctx)
}

func (s *AdminUserService) execOperator(ctx context.Context, sql, id string, args ...any) error {
	tag, err := s.pool.Exec(ctx, sql, append([]any{id}, args...)...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAdminUserNotFound
	}
	return nil
}

// CountActiveSuperAdmins underpins the "last SUPER_ADMIN" guards.
//
// "Active" here means NOT SUSPENDED, not status='ACTIVE'. Splitting the
// lifecycle so that ACTIVE means fully enrolled would otherwise have quietly
// weakened this guard: an organisation whose only SUPER_ADMIN is part-way
// through enrolling a factor would count zero, and the guard would then permit
// demoting or suspending them — leaving nobody who can ever administer the
// console. They are still the super admin; they simply cannot sign in yet.
func (s *AdminUserService) CountActiveSuperAdmins(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM admin_users WHERE `+superAdminWhoCanAdminister).Scan(&n)
	return n, err
}

// superAdminWhoCanAdminister: a SUPER_ADMIN who is not suspended and has set a
// password. An INVITED SUPER_ADMIN with no password was counted, so the only
// real one could demote themselves while an unused invite existed — and once
// that invite expired, only a SUPER_ADMIN could resend it (A5-11). Someone
// part-way through enrolling a factor still counts: they have a password and
// finish enrolling themselves.
const superAdminWhoCanAdminister = `role = 'SUPER_ADMIN' AND status <> 'SUSPENDED' AND COALESCE(password_hash, '') <> ''`
