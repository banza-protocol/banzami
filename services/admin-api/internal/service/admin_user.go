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
	ID           string
	Email        string
	FullName     string
	PasswordHash string
	Role         string
	Status       string
	LastLoginAt  *time.Time
}

type AdminUserService struct {
	pool *pgxpool.Pool
}

func NewAdminUserService(pool *pgxpool.Pool) *AdminUserService {
	return &AdminUserService{pool: pool}
}

const adminUserCols = `id::text, email, full_name, password_hash, role, status, last_login_at`

func scanAdminUser(row pgx.Row) (AdminUser, error) {
	var u AdminUser
	err := row.Scan(&u.ID, &u.Email, &u.FullName, &u.PasswordHash, &u.Role, &u.Status, &u.LastLoginAt)
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

// UpdatePassword replaces an operator's bcrypt hash and bumps updated_at.
func (s *AdminUserService) UpdatePassword(ctx context.Context, id, passwordHash string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE admin_users SET password_hash = $2, updated_at = now() WHERE id = $1`, id, passwordHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAdminUserNotFound
	}
	return nil
}

// Create inserts a new operator (bootstrap). Fails if the email exists.
func (s *AdminUserService) Create(ctx context.Context, email, fullName, passwordHash, role string) (string, error) {
	id := uuid.NewString()
	_, err := s.pool.Exec(ctx,
		`INSERT INTO admin_users (id, email, full_name, password_hash, role, status)
		 VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
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
