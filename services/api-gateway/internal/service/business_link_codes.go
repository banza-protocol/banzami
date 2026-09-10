package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Business link codes (migration 0121) — a Business's consent, from its own
// signed-in session, to a Developer Project using it.
//
// A developer whose Project belongs to a Business that already exists must not
// be sent through onboarding again, and must not be able to claim a Business by
// naming it: typing @doa, an id or an email proves nothing about who is typing.
// So the Business App issues a code — short-lived, single use, shown only on
// the Business's own screen — and the Project's owner enters it in the Console.
// Redeeming it is the proof. Nothing about the Business is disclosed before the
// code is redeemed, and a wrong code is indistinguishable from an expired one.
//
// 12 characters over a 31-letter alphabet is about 59 bits; with a 10-minute life a
// guess is not a strategy.

const (
	businessLinkCodeTTL    = 10 * time.Minute
	businessLinkCodeLength = 12
	// No 0/O, 1/I/L: a code is read off one screen and typed into another.
	businessLinkCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
)

var (
	// ErrLinkCodeInvalid is any code that cannot be redeemed: unknown,
	// expired, or already used by another Project. One answer for all.
	ErrLinkCodeInvalid = errors.New("the code is not valid; ask the Business for a new one")
	// ErrLinkBusinessNotReady: the Business behind the code cannot receive yet
	// (not ACTIVE, no handle, no active AOA wallet).
	ErrLinkBusinessNotReady = errors.New("the Business cannot be connected yet")
)

// IssuedLinkCode is what the Business App shows.
type IssuedLinkCode struct {
	Code      string    `json:"code"`
	ExpiresAt time.Time `json:"expires_at"`
}

// BusinessLinkTarget is what a redeemed code resolves to, for the Developer
// Platform to bind the Project. It never reaches a browser: developer-api
// turns it into a binding and shows the developer the Business's public name
// and handle.
type BusinessLinkTarget struct {
	MerchantID      string `json:"merchant_id"`
	WalletID        string `json:"wallet_id"`
	WalletAccountID string `json:"wallet_account_id"`
	Handle          string `json:"handle"`
	BusinessName    string `json:"business_name"`
	KybStatus       string `json:"kyb_status"`
	Environment     string `json:"environment"`
}

type BusinessLinkCodeService interface {
	Issue(ctx context.Context, merchantID, environment string) (IssuedLinkCode, error)
	Redeem(ctx context.Context, code, projectID string) (BusinessLinkTarget, error)
}

type PostgresBusinessLinkCodeService struct {
	pool *pgxpool.Pool
	now  func() time.Time
}

func NewPostgresBusinessLinkCodeService(pool *pgxpool.Pool) *PostgresBusinessLinkCodeService {
	return &PostgresBusinessLinkCodeService{pool: pool, now: time.Now}
}

// newLinkCode draws each character uniformly: bytes past the largest multiple
// of the alphabet's size are discarded rather than folded in, which would make
// the first letters likelier.
func newLinkCode() (string, error) {
	n := len(businessLinkCodeAlphabet)
	limit := 256 - 256%n
	out := make([]byte, 0, businessLinkCodeLength)
	var buf [32]byte
	for len(out) < businessLinkCodeLength {
		if _, err := rand.Read(buf[:]); err != nil {
			return "", err
		}
		for _, v := range buf {
			if int(v) < limit && len(out) < businessLinkCodeLength {
				out = append(out, businessLinkCodeAlphabet[int(v)%n])
			}
		}
	}
	return string(out), nil
}

// normaliseLinkCode accepts what a person types: any case, with or without the
// dashes the screen groups it with.
func normaliseLinkCode(code string) string {
	return strings.ToUpper(strings.NewReplacer("-", "", " ", "").Replace(strings.TrimSpace(code)))
}

func hashLinkCode(code string) string {
	sum := sha256.Sum256([]byte(normaliseLinkCode(code)))
	return hex.EncodeToString(sum[:])
}

// FormatLinkCode groups a code for reading: ABCD-EFGH-JKMN.
func FormatLinkCode(code string) string {
	c := normaliseLinkCode(code)
	var parts []string
	for i := 0; i < len(c); i += 4 {
		end := i + 4
		if end > len(c) {
			end = len(c)
		}
		parts = append(parts, c[i:end])
	}
	return strings.Join(parts, "-")
}

// Issue creates a new code and retires the Business's earlier unused ones: at
// most one consent is live at a time.
func (s *PostgresBusinessLinkCodeService) Issue(ctx context.Context, merchantID, environment string) (IssuedLinkCode, error) {
	code, err := newLinkCode()
	if err != nil {
		return IssuedLinkCode{}, err
	}
	now := s.now()
	expires := now.Add(businessLinkCodeTTL)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return IssuedLinkCode{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx,
		`UPDATE business_link_codes SET expires_at = LEAST(expires_at, $2)
		  WHERE merchant_id = $1 AND redeemed_at IS NULL AND expires_at > $2`, merchantID, now); err != nil {
		return IssuedLinkCode{}, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO business_link_codes (merchant_id, environment, code_hash, created_at, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`, merchantID, environment, hashLinkCode(code), now, expires); err != nil {
		return IssuedLinkCode{}, fmt.Errorf("issue link code: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return IssuedLinkCode{}, err
	}
	return IssuedLinkCode{Code: FormatLinkCode(code), ExpiresAt: expires}, nil
}

// Redeem spends a code for a Project and returns the Business it names. The
// same Project redeeming the same code again gets the same answer (a retried
// request); any other Project gets ErrLinkCodeInvalid.
func (s *PostgresBusinessLinkCodeService) Redeem(ctx context.Context, code, projectID string) (BusinessLinkTarget, error) {
	if _, err := uuid.Parse(projectID); err != nil || len(normaliseLinkCode(code)) != businessLinkCodeLength {
		return BusinessLinkTarget{}, ErrLinkCodeInvalid
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return BusinessLinkTarget{}, err
	}
	defer tx.Rollback(ctx)
	var (
		id, merchantID, environment string
		expires                     time.Time
		redeemedFor                 *string
	)
	err = tx.QueryRow(ctx,
		`SELECT id, merchant_id, environment, expires_at, redeemed_project_id::text
		   FROM business_link_codes WHERE code_hash = $1 FOR UPDATE`, hashLinkCode(code)).
		Scan(&id, &merchantID, &environment, &expires, &redeemedFor)
	if errors.Is(err, pgx.ErrNoRows) {
		return BusinessLinkTarget{}, ErrLinkCodeInvalid
	}
	if err != nil {
		return BusinessLinkTarget{}, err
	}
	switch {
	case redeemedFor != nil && *redeemedFor != projectID:
		return BusinessLinkTarget{}, ErrLinkCodeInvalid
	case redeemedFor == nil && !s.now().Before(expires):
		return BusinessLinkTarget{}, ErrLinkCodeInvalid
	}

	target := BusinessLinkTarget{MerchantID: merchantID, Environment: environment}
	var status string
	err = tx.QueryRow(ctx,
		`SELECT m.name, m.status,
		        COALESCE((SELECT hr.handle FROM handle_registry hr
		                   WHERE hr.owner_type = 'MERCHANT' AND hr.owner_id = m.id
		                   ORDER BY hr.created_at, hr.handle LIMIT 1), ''),
		        COALESCE((SELECT c.kyb_status FROM merchant_compliance c WHERE c.merchant_id = m.id), 'PENDING'),
		        COALESCE(w.id::text, ''), COALESCE(wa.id::text, '')
		   FROM merchants m
		   LEFT JOIN wallets w ON w.merchant_id = m.id AND w.currency = 'AOA' AND w.status = 'ACTIVE'
		   LEFT JOIN wallet_accounts wa ON wa.wallet_id = w.id AND wa.purpose = 'PRIMARY'
		  WHERE m.id = $1`, merchantID).
		Scan(&target.BusinessName, &status, &target.Handle, &target.KybStatus, &target.WalletID, &target.WalletAccountID)
	if err != nil {
		return BusinessLinkTarget{}, err
	}
	if status != "ACTIVE" || target.Handle == "" || target.WalletID == "" || target.WalletAccountID == "" {
		return BusinessLinkTarget{}, ErrLinkBusinessNotReady
	}
	if redeemedFor == nil {
		if _, err := tx.Exec(ctx,
			`UPDATE business_link_codes SET redeemed_at = now(), redeemed_project_id = $2 WHERE id = $1`,
			id, projectID); err != nil {
			return BusinessLinkTarget{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return BusinessLinkTarget{}, err
	}
	return target, nil
}
