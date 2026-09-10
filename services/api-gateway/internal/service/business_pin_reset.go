package service

// An operator resets a Business's app PIN.
//
// A Business that forgot its PIN had no way back: activation links are
// reissued only while the login has never been used. This is the recovery an
// operator performs from BANZADMIN: a fresh single-use activation link for
// the login that already exists — the same link, the same page, the same
// completion as the first activation. Nothing changes until the link is used:
// the current PIN keeps working, and a reset nobody completes expires on its
// own. Completing it sets the new PIN and ends every open session of that
// login (activation.go).

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	// ErrPinResetNoLogin: the Business has no activated app login to reset —
	// a never-activated one gets its activation link reissued instead.
	ErrPinResetNoLogin = errors.New("business has no activated app login")
	// ErrPinResetNotActive: a suspended or closed Business is not given a way in.
	ErrPinResetNotActive = errors.New("business is not active")
)

// PinReset is what the operator's console needs to deliver the link. The raw
// token is returned once, for the link; only its hash is stored.
type PinReset struct {
	MerchantID      string    `json:"merchant_id"`
	Email           string    `json:"email"`
	BusinessName    string    `json:"business_name"`
	Handle          string    `json:"handle"`
	Environment     string    `json:"environment"`
	ActivationToken string    `json:"activation_token"`
	ExpiresAt       time.Time `json:"expires_at"`
}

type BusinessPinResetService struct {
	pool *pgxpool.Pool
}

func NewBusinessPinResetService(pool *pgxpool.Pool) *BusinessPinResetService {
	return &BusinessPinResetService{pool: pool}
}

func (s *BusinessPinResetService) Reset(ctx context.Context, merchantID string, ttl time.Duration) (PinReset, error) {
	var (
		out       PinReset
		status    string
		activated *time.Time
	)
	err := s.pool.QueryRow(ctx,
		`SELECT m.id::text, COALESCE(m.email, ''), m.name, m.status, c.handle, c.environment, c.activated_at
		   FROM merchant_app_credentials c JOIN merchants m ON m.id = c.merchant_id
		  WHERE c.merchant_id::text = $1`, merchantID).
		Scan(&out.MerchantID, &out.Email, &out.BusinessName, &status, &out.Handle, &out.Environment, &activated)
	if errors.Is(err, pgx.ErrNoRows) {
		return PinReset{}, ErrPinResetNoLogin
	}
	if err != nil {
		return PinReset{}, err
	}
	if status != "ACTIVE" {
		return PinReset{}, ErrPinResetNotActive
	}
	if activated == nil {
		return PinReset{}, ErrPinResetNoLogin
	}
	raw, err := randomToken(32)
	if err != nil {
		return PinReset{}, err
	}
	out.ActivationToken = raw
	out.ExpiresAt = time.Now().Add(ttl)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PinReset{}, err
	}
	defer tx.Rollback(ctx)
	// One live link at a time: an earlier unused one stops working.
	if _, err := tx.Exec(ctx,
		`UPDATE merchant_activation_tokens SET expires_at = LEAST(expires_at, now())
		  WHERE merchant_id = $1 AND environment = $2 AND used_at IS NULL`,
		out.MerchantID, out.Environment); err != nil {
		return PinReset{}, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO merchant_activation_tokens (id, merchant_id, environment, token_hash, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		uuid.NewString(), out.MerchantID, out.Environment, hashToken(raw), out.ExpiresAt); err != nil {
		return PinReset{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return PinReset{}, err
	}
	return out, nil
}
