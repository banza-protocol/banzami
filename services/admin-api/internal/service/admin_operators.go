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
	CreatedAt   time.Time  `json:"created_at"`
}

var ValidRoles = map[string]bool{
	"SUPER_ADMIN": true, "OPERATIONS": true, "COMPLIANCE": true, "SUPPORT": true, "READ_ONLY": true,
}

const operatorCols = `id::text, email, full_name, role, status, last_login_at, locked_until,
	(password_hash IS NOT NULL) AS password_set, created_at`

func scanOperator(row pgx.Row) (OperatorView, error) {
	var o OperatorView
	err := row.Scan(&o.ID, &o.Email, &o.FullName, &o.Role, &o.Status, &o.LastLoginAt,
		&o.LockedUntil, &o.PasswordSet, &o.CreatedAt)
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

// CreateOperator inserts an operator WITHOUT a password (password_hash NULL).
// They cannot log in until a password is set via a reset link.
func (s *AdminUserService) CreateOperator(ctx context.Context, email, fullName, role, createdBy string) (string, error) {
	id := uuid.NewString()
	_, err := s.pool.Exec(ctx,
		`INSERT INTO admin_users (id, email, full_name, role, status, created_by, updated_by)
		 VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $5)`,
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
	return s.execOperator(ctx, `UPDATE admin_users SET role=$2, updated_by=$3, updated_at=now() WHERE id=$1`, id, role, nullStr(updatedBy))
}

// SetOperatorStatus also clears the lock when re-activating.
func (s *AdminUserService) SetOperatorStatus(ctx context.Context, id, status, updatedBy string) error {
	return s.execOperator(ctx,
		`UPDATE admin_users
		    SET status=$2, updated_by=$3, updated_at=now(),
		        failed_login_attempts = CASE WHEN $2='ACTIVE' THEN 0 ELSE failed_login_attempts END,
		        locked_until = CASE WHEN $2='ACTIVE' THEN NULL ELSE locked_until END
		  WHERE id=$1`, id, status, nullStr(updatedBy))
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
func (s *AdminUserService) CountActiveSuperAdmins(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM admin_users WHERE role='SUPER_ADMIN' AND status='ACTIVE'`).Scan(&n)
	return n, err
}
