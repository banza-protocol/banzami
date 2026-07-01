package service

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BusinessSelfProfile is the operator's authoritative view of ONE Business
// account, assembled for the account itself (never for enumeration). It carries
// only non-secret fields safe to hand to an integrating application (e.g. DOA)
// so it can render an "Integration Health" surface. It never exposes API keys,
// PINs, ledger account ids, balances, or another tenant's data.
type BusinessSelfProfile struct {
	MerchantID          string  `json:"id"`
	Handle              string  `json:"handle"`
	BusinessName        string  `json:"business_name"`
	BusinessAccountType string  `json:"business_account_type"`
	Status              string  `json:"status"`
	Category            *string `json:"category"`
	KybStatus           string  `json:"kyb_status"`
	Verified            bool    `json:"verified"`
	WalletReady         bool    `json:"wallet_ready"`
}

// BusinessSelfService reads the consolidated self-profile of a Business account
// (merchant identity + public profile + KYB status) in one query, from the
// gateway database.
type BusinessSelfService struct {
	pool *pgxpool.Pool
}

func NewBusinessSelfService(pool *pgxpool.Pool) *BusinessSelfService {
	return &BusinessSelfService{pool: pool}
}

// Self returns the consolidated profile for the given merchant id. The merchant
// id always comes from the authenticated principal — this is a self lookup, not
// a by-id/by-handle oracle. Returns ErrMerchantNotFound if the merchant row is
// absent.
func (s *BusinessSelfService) Self(ctx context.Context, merchantID string) (*BusinessSelfProfile, error) {
	if s == nil || s.pool == nil {
		return nil, errors.New("business self service is not configured")
	}

	var (
		p         BusinessSelfProfile
		handle    *string
		display   *string
		category  *string
		walletID  *string
		kybStatus *string
	)

	// merchant identity is authoritative; the public profile (handle, category,
	// wallet) and compliance (KYB) are LEFT JOINed so a freshly-created account
	// still resolves with sensible defaults instead of a 404.
	err := s.pool.QueryRow(ctx, `
		SELECT m.id::text, m.name, COALESCE(m.status,''),
		       COALESCE(m.business_account_type,'MERCHANT'),
		       mp.handle, mp.display_name, mp.category, mp.wallet_id::text,
		       mc.kyb_status
		  FROM merchants m
		  LEFT JOIN merchant_profiles   mp ON mp.merchant_id = m.id
		  LEFT JOIN merchant_compliance mc ON mc.merchant_id = m.id
		 WHERE m.id = $1`, merchantID).
		Scan(&p.MerchantID, &p.BusinessName, &p.Status, &p.BusinessAccountType,
			&handle, &display, &category, &walletID, &kybStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMerchantNotFound
		}
		return nil, err
	}

	if handle != nil {
		p.Handle = *handle
	}
	if display != nil && strings.TrimSpace(*display) != "" {
		p.BusinessName = *display
	}
	p.Category = category
	p.WalletReady = walletID != nil && strings.TrimSpace(*walletID) != ""

	p.KybStatus = "PENDING"
	if kybStatus != nil && strings.TrimSpace(*kybStatus) != "" {
		p.KybStatus = *kybStatus
	}
	p.Verified = p.KybStatus == "APPROVED"

	return &p, nil
}
