package accountidentity

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pgStore is the Postgres-backed Store over the account_identity.* schema.
type pgStore struct {
	pool *pgxpool.Pool
}

// NewPGStore builds a Postgres Store.
func NewPGStore(pool *pgxpool.Pool) Store { return &pgStore{pool: pool} }

func (s *pgStore) IssueOTP(ctx context.Context, in OTPInsert) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Invalidate any prior active code (enforces the one-active partial unique
	// index and makes resend replace the previous code).
	if _, err = tx.Exec(ctx,
		`UPDATE account_identity.identity_otp_codes
		    SET consumed_at = now()
		  WHERE lower(email) = lower($1) AND purpose = $2 AND consumed_at IS NULL`,
		in.Email, in.Purpose); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx,
		`INSERT INTO account_identity.identity_otp_codes
		    (email, purpose, code_hash, hash_version, expires_at, request_ip)
		  VALUES (lower($1), $2, $3, $4, $5, $6)`,
		in.Email, in.Purpose, in.CodeHash, in.HashVersion, in.ExpiresAt, nullStr(in.RequestIP)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *pgStore) VerifyOTP(ctx context.Context, email, purpose, code, pepper string) (OTPResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return OTPInvalid, err
	}
	defer tx.Rollback(ctx)

	var (
		id                    string
		codeHash              string
		expiresAt             time.Time
		attempts, maxAttempts int
	)
	err = tx.QueryRow(ctx,
		`SELECT id, code_hash, expires_at, attempts, max_attempts
		   FROM account_identity.identity_otp_codes
		  WHERE lower(email) = lower($1) AND purpose = $2 AND consumed_at IS NULL
		  ORDER BY created_at DESC
		  LIMIT 1
		  FOR UPDATE`,
		email, purpose).Scan(&id, &codeHash, &expiresAt, &attempts, &maxAttempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return OTPNoActive, nil
	}
	if err != nil {
		return OTPInvalid, err
	}

	if time.Now().After(expiresAt) {
		return OTPExpired, nil
	}
	if attempts >= maxAttempts {
		return OTPTooManyAttempts, nil
	}

	if otpMatches(code, codeHash, pepper) {
		if _, err = tx.Exec(ctx,
			`UPDATE account_identity.identity_otp_codes SET consumed_at = now() WHERE id = $1`, id); err != nil {
			return OTPInvalid, err
		}
		if err = tx.Commit(ctx); err != nil {
			return OTPInvalid, err
		}
		return OTPOK, nil
	}

	if _, err = tx.Exec(ctx,
		`UPDATE account_identity.identity_otp_codes SET attempts = attempts + 1 WHERE id = $1`, id); err != nil {
		return OTPInvalid, err
	}
	if err = tx.Commit(ctx); err != nil {
		return OTPInvalid, err
	}
	return OTPInvalid, nil
}

func (s *pgStore) UpsertVerifiedUser(ctx context.Context, email string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx,
		`INSERT INTO account_identity.identity_users (email, verified)
		      VALUES (lower($1), true)
		 ON CONFLICT (lower(email))
		 DO UPDATE SET verified = true, updated_at = now()
		   RETURNING id, email, COALESCE(name,''), verified, status, created_at, updated_at`,
		email).Scan(&u.ID, &u.Email, &u.Name, &u.Verified, &u.Status, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

func (s *pgStore) UserByID(ctx context.Context, id string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, COALESCE(name,''), verified, status, created_at, updated_at
		   FROM account_identity.identity_users WHERE id = $1`,
		id).Scan(&u.ID, &u.Email, &u.Name, &u.Verified, &u.Status, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return u, err
}

func (s *pgStore) SetUserName(ctx context.Context, id, name string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx,
		`UPDATE account_identity.identity_users
		    SET name = $2, updated_at = now()
		  WHERE id = $1
		 RETURNING id, email, COALESCE(name,''), verified, status, created_at, updated_at`,
		id, name).Scan(&u.ID, &u.Email, &u.Name, &u.Verified, &u.Status, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return u, err
}

func (s *pgStore) CreateSession(ctx context.Context, in SessionInsert) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO account_identity.identity_sessions
		    (user_id, token_hash, user_agent, ip, expires_at)
		  VALUES ($1, $2, $3, $4, $5)`,
		in.UserID, in.TokenHash, nullStr(in.UserAgent), nullStr(in.IP), in.ExpiresAt)
	return err
}

func (s *pgStore) LiveSessionByHash(ctx context.Context, tokenHash string) (*Session, error) {
	var sess Session
	err := s.pool.QueryRow(ctx,
		`SELECT id, user_id, expires_at
		   FROM account_identity.identity_sessions
		  WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
		tokenHash).Scan(&sess.ID, &sess.UserID, &sess.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &sess, nil
}

func (s *pgStore) LiveSessions(ctx context.Context, userID string) ([]SessionView, error) {
	rows, err := s.pool.Query(ctx,
		// ip is TEXT here, not inet: host(ip) does not exist for it and the query
		// failed at runtime, which the handler then reported as "not authenticated".
		`SELECT id, COALESCE(user_agent,''), COALESCE(ip,''), created_at, last_seen_at, expires_at
		   FROM account_identity.identity_sessions
		  WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
		  ORDER BY COALESCE(last_seen_at, created_at) DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SessionView{}
	for rows.Next() {
		var v SessionView
		if err := rows.Scan(&v.ID, &v.UserAgent, &v.IP, &v.CreatedAt, &v.LastSeenAt, &v.ExpiresAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *pgStore) RevokeOtherSessions(ctx context.Context, userID, keepSessionID string) (int, error) {
	tag, err := s.pool.Exec(ctx,
		`UPDATE account_identity.identity_sessions
		    SET revoked_at = now()
		  WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`, userID, keepSessionID)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

func (s *pgStore) TouchSession(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE account_identity.identity_sessions SET last_seen_at = now() WHERE id = $1`, id)
	return err
}

func (s *pgStore) RevokeSessionByHash(ctx context.Context, tokenHash string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE account_identity.identity_sessions
		    SET revoked_at = now()
		  WHERE token_hash = $1 AND revoked_at IS NULL`, tokenHash)
	return err
}

func (s *pgStore) InsertAudit(ctx context.Context, ev AuditEvent) error {
	meta := ev.Metadata
	if meta == nil {
		meta = map[string]any{}
	}
	b, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO account_identity.audit_events
		    (actor_user_id, action, subject, metadata, request_ip, request_id)
		  VALUES ($1, $2, $3, $4, $5, $6)`,
		ev.ActorUserID, ev.Action, nullStr(ev.Subject), b, nullStr(ev.RequestIP), nullStr(ev.RequestID))
	return err
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}
