package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Business App sessions (migration 0120).
//
// A sign-in (@handle + PIN) opens a session. The app holds a short access
// token and a refresh token; the refresh token is single use, rotates on every
// renewal, and a sign-in lasts at most BusinessSessionLifetime however often
// it is renewed. Presenting a refresh token that was already exchanged revokes
// the whole sign-in: two holders of one token means one of them copied it.
//
// Renewal re-checks what sign-in checked: the Business is ACTIVE and the login
// still belongs to the owner of its handle. A suspension or a handle that left
// the Business ends the session at the next renewal, not at the next PIN.

// BusinessSessionLifetime bounds one sign-in, across all its renewals.
const BusinessSessionLifetime = 30 * 24 * time.Hour

var (
	// ErrSessionInvalid is any refusal to renew: unknown, expired, revoked.
	// Callers answer it with one non-enumerating 401.
	ErrSessionInvalid = errors.New("business session is not valid")
	// ErrSessionReused is a replaced refresh token presented again. The
	// sign-in it belonged to has been revoked. Still a 401 to the caller.
	ErrSessionReused = fmt.Errorf("%w: refresh token reused", ErrSessionInvalid)
)

// IssuedSession is what a sign-in or a renewal hands the app.
type IssuedSession struct {
	MerchantID       string
	Environment      string
	RefreshToken     string
	RefreshExpiresAt time.Time
}

// MerchantSessionService opens, renews and ends Business App sessions.
type MerchantSessionService interface {
	Open(ctx context.Context, merchantID, environment string) (IssuedSession, error)
	Renew(ctx context.Context, refreshToken string) (IssuedSession, error)
	End(ctx context.Context, refreshToken string) error
}

type PostgresMerchantSessionService struct {
	pool *pgxpool.Pool
	now  func() time.Time
}

func NewPostgresMerchantSessionService(pool *pgxpool.Pool) *PostgresMerchantSessionService {
	return &PostgresMerchantSessionService{pool: pool, now: time.Now}
}

func newRefreshToken() (string, string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", "", err
	}
	raw := "bzs_" + base64.RawURLEncoding.EncodeToString(b[:])
	return raw, hashRefreshToken(raw), nil
}

func hashRefreshToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func (s *PostgresMerchantSessionService) Open(ctx context.Context, merchantID, environment string) (IssuedSession, error) {
	raw, hash, err := newRefreshToken()
	if err != nil {
		return IssuedSession{}, err
	}
	expires := s.now().Add(BusinessSessionLifetime)
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO merchant_app_sessions (family_id, merchant_id, environment, refresh_token_hash, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		uuid.New(), merchantID, environment, hash, expires); err != nil {
		return IssuedSession{}, fmt.Errorf("open business session: %w", err)
	}
	return IssuedSession{MerchantID: merchantID, Environment: environment, RefreshToken: raw, RefreshExpiresAt: expires}, nil
}

func (s *PostgresMerchantSessionService) Renew(ctx context.Context, refreshToken string) (IssuedSession, error) {
	if refreshToken == "" {
		return IssuedSession{}, ErrSessionInvalid
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return IssuedSession{}, err
	}
	defer tx.Rollback(ctx)

	var (
		id, family, merchantID, environment string
		expires                             time.Time
		rotated, revoked                    *time.Time
	)
	err = tx.QueryRow(ctx,
		`SELECT id, family_id, merchant_id, environment, expires_at, rotated_at, revoked_at
		   FROM merchant_app_sessions WHERE refresh_token_hash = $1 FOR UPDATE`,
		hashRefreshToken(refreshToken)).
		Scan(&id, &family, &merchantID, &environment, &expires, &rotated, &revoked)
	if errors.Is(err, pgx.ErrNoRows) {
		return IssuedSession{}, ErrSessionInvalid
	}
	if err != nil {
		return IssuedSession{}, err
	}
	if revoked != nil || !s.now().Before(expires) {
		return IssuedSession{}, ErrSessionInvalid
	}
	if rotated != nil {
		// Reuse. The token's successor may be in someone else's hands: end the
		// whole sign-in, and commit that even though the caller is refused.
		if err := revokeFamily(ctx, tx, family, "REUSE_DETECTED"); err != nil {
			return IssuedSession{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return IssuedSession{}, err
		}
		return IssuedSession{}, ErrSessionReused
	}

	// What sign-in checked, checked again.
	var active, ownsHandle bool
	if err := tx.QueryRow(ctx,
		`SELECT m.status = 'ACTIVE',
		        EXISTS (SELECT 1 FROM merchant_app_credentials c
		                  JOIN handle_registry hr ON hr.handle = c.handle
		                 WHERE c.merchant_id = m.id AND c.environment = $2
		                   AND hr.owner_type = 'MERCHANT' AND hr.owner_id = m.id)
		   FROM merchants m WHERE m.id = $1`, merchantID, environment).Scan(&active, &ownsHandle); err != nil {
		return IssuedSession{}, err
	}
	if !active || !ownsHandle {
		reason := "BUSINESS_NOT_ACTIVE"
		if active {
			reason = "HANDLE_NOT_OWNED"
		}
		if err := revokeFamily(ctx, tx, family, reason); err != nil {
			return IssuedSession{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return IssuedSession{}, err
		}
		return IssuedSession{}, ErrSessionInvalid
	}

	raw, hash, err := newRefreshToken()
	if err != nil {
		return IssuedSession{}, err
	}
	now := s.now()
	if _, err := tx.Exec(ctx, `UPDATE merchant_app_sessions SET rotated_at = $2 WHERE id = $1`, id, now); err != nil {
		return IssuedSession{}, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO merchant_app_sessions (family_id, merchant_id, environment, refresh_token_hash, created_at, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		family, merchantID, environment, hash, now, expires); err != nil {
		return IssuedSession{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return IssuedSession{}, err
	}
	return IssuedSession{MerchantID: merchantID, Environment: environment, RefreshToken: raw, RefreshExpiresAt: expires}, nil
}

// End signs out: the sign-in the token belongs to is revoked, whichever of its
// rotations is presented. An unknown token is not an error — signing out twice
// is still signed out.
func (s *PostgresMerchantSessionService) End(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return nil
	}
	_, err := s.pool.Exec(ctx,
		`UPDATE merchant_app_sessions SET revoked_at = now(), revoked_reason = 'SIGNED_OUT'
		  WHERE revoked_at IS NULL
		    AND family_id = (SELECT family_id FROM merchant_app_sessions WHERE refresh_token_hash = $1)`,
		hashRefreshToken(refreshToken))
	return err
}

func revokeFamily(ctx context.Context, tx pgx.Tx, family, reason string) error {
	_, err := tx.Exec(ctx,
		`UPDATE merchant_app_sessions SET revoked_at = now(), revoked_reason = $2
		  WHERE family_id = $1 AND revoked_at IS NULL`, family, reason)
	return err
}
