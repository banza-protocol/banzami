package service

import (
	"context"
	"crypto/rand"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Business Receive Point (ADR-065). A stable, public, opaque receive identity for
// one eligible Business. Scanning its QR pays nothing: it resolves this public
// identity and the payer then mints a FRESH Payment Session per payment. The QR
// is persistent; the session is not. This object is not financial state and its
// lifecycle has zero ledger effect — only the minted session reaches Core.
//
// Security: the slug is PUBLIC, not a secret (RECEIVE_POINT_SLUG_AS_SECRET=0).
// Authority is server-side: resolution and session-mint re-derive the Business
// from the slug and re-check current eligibility; the client never chooses the
// destination (CLIENT_SELECTED_BUSINESS_DESTINATION_AUTHORITY=0).

var (
	ErrReceivePointNotFound   = errors.New("receive point not found")
	ErrReceivePointDisabled   = errors.New("receive point disabled")
	ErrReceivePointIneligible = errors.New("business cannot receive")
)

// receivePointSlugAlphabet is base62; 22 chars ≈ 131 bits of entropy — opaque and
// unguessable, never derived from any business/wallet id (RECEIVE_POINT_PREDICTABLE_IDS=0).
const receivePointSlugAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const receivePointSlugLen = 22

// ReceivePoint is the operator-internal view (carries the merchant id).
type ReceivePoint struct {
	MerchantID  string
	PublicSlug  string
	Status      string
	Environment string
}

// ReceivePointPublic is the payer-safe resolution: only what a review needs. It
// never carries a wallet/owner/binding/project id or pricing (§13/§16).
type ReceivePointPublic struct {
	Slug        string `json:"slug"`
	DisplayName string `json:"display_name"`
	Handle      string `json:"handle"`
	Currency    string `json:"currency"`
	Environment string `json:"environment"`
	Status      string `json:"status"`
}

type BusinessReceivePointService struct{ pool *pgxpool.Pool }

func NewBusinessReceivePointService(pool *pgxpool.Pool) *BusinessReceivePointService {
	return &BusinessReceivePointService{pool: pool}
}

// newSlug returns a cryptographically random opaque public slug.
func newSlug() (string, error) {
	b := make([]byte, receivePointSlugLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = receivePointSlugAlphabet[int(b[i])%len(receivePointSlugAlphabet)]
	}
	return string(b), nil
}

// EnsureActive returns the Business's one ACTIVE receive point for the environment,
// creating it if absent. Idempotent and race-safe: the partial unique index
// (uq_business_receive_points_one_active) guarantees at most one ACTIVE row, so a
// concurrent creator's INSERT is a no-op and both callers read the same row.
// It does NOT depend on a Developer Project and is never DOA-special.
func (s *BusinessReceivePointService) EnsureActive(ctx context.Context, merchantID, environment string) (*ReceivePoint, error) {
	if rp, err := s.activeByMerchant(ctx, merchantID, environment); err == nil {
		return rp, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	slug, err := newSlug()
	if err != nil {
		return nil, err
	}
	// ON CONFLICT on the active partial index: a race loser inserts nothing.
	_, err = s.pool.Exec(ctx,
		`INSERT INTO business_receive_points (merchant_id, public_slug, status, environment)
		 VALUES ($1, $2, 'ACTIVE', $3)
		 ON CONFLICT (merchant_id, environment) WHERE status = 'ACTIVE' DO NOTHING`,
		merchantID, slug, environment)
	if err != nil {
		return nil, err
	}
	return s.activeByMerchant(ctx, merchantID, environment)
}

func (s *BusinessReceivePointService) activeByMerchant(ctx context.Context, merchantID, environment string) (*ReceivePoint, error) {
	rp := &ReceivePoint{MerchantID: merchantID, Environment: environment, Status: "ACTIVE"}
	err := s.pool.QueryRow(ctx,
		`SELECT public_slug FROM business_receive_points
		  WHERE merchant_id = $1 AND environment = $2 AND status = 'ACTIVE'`,
		merchantID, environment).Scan(&rp.PublicSlug)
	if err != nil {
		return nil, err
	}
	return rp, nil
}

// ResolveForPayment resolves a public slug to a payer-safe identity, re-checking
// CURRENT eligibility so a stale printed QR fails closed after a later
// disable/suspension. It is READ-ONLY: no session, no ledger, no reservation
// (RECEIVE_POINT_RESOLVE_FINANCIAL_EFFECTS=0). Returns the resolved merchant id
// (server authority) alongside the public view.
func (s *BusinessReceivePointService) ResolveForPayment(ctx context.Context, slug string) (*ReceivePointPublic, string, error) {
	var (
		pub        ReceivePointPublic
		merchantID string
		pointStat  string
		merchStat  string
	)
	err := s.pool.QueryRow(ctx,
		`SELECT rp.public_slug, rp.status, rp.environment, m.id::text, m.status,
		        m.name,
		        COALESCE((SELECT handle FROM handle_registry
		                    WHERE owner_type='MERCHANT' AND owner_id=m.id
		                    ORDER BY created_at LIMIT 1), ''),
		        COALESCE((SELECT currency FROM wallets
		                    WHERE merchant_id=m.id
		                    ORDER BY (status='ACTIVE') DESC, created_at LIMIT 1), 'AOA')
		   FROM business_receive_points rp
		   JOIN merchants m ON m.id = rp.merchant_id
		  WHERE rp.public_slug = $1`,
		slug).Scan(&pub.Slug, &pointStat, &pub.Environment, &merchantID, &merchStat, &pub.DisplayName, &pub.Handle, &pub.Currency)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", ErrReceivePointNotFound
	}
	if err != nil {
		return nil, "", err
	}
	if pointStat != "ACTIVE" {
		return nil, "", ErrReceivePointDisabled
	}
	// Current Business eligibility — the one authoritative status. A stale printed
	// QR must not bypass a later suspension (STALE_PRINTED_QR_BYPASSES_BUSINESS_STATE=0).
	if merchStat != "ACTIVE" {
		return nil, "", ErrReceivePointIneligible
	}
	pub.Status = "ACTIVE"
	return &pub, merchantID, nil
}

// Disable retires the Business's active receive point (operator/system lifecycle).
// After this, the printed QR fails closed on resolve. Zero ledger effect.
func (s *BusinessReceivePointService) Disable(ctx context.Context, merchantID, environment string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE business_receive_points SET status='DISABLED', disabled_at=now(), updated_at=now()
		  WHERE merchant_id=$1 AND environment=$2 AND status='ACTIVE'`,
		merchantID, environment)
	return err
}
