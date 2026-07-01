package service

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Settlement-readiness blocker reason codes. Stable, machine-readable — apps map
// them to their own copy. Absence of blockers ⇒ the account can be settled.
const (
	BlockerBusinessNotActive   = "BUSINESS_NOT_ACTIVE"
	BlockerKybNotApproved      = "KYB_NOT_APPROVED"
	BlockerWalletMissing       = "WALLET_MISSING"
	BlockerWalletAccountMissing = "WALLET_ACCOUNT_MISSING"
	BlockerPricingMissing      = "PRICING_MISSING"
)

// BusinessResolution is the operator's authoritative, consolidated view of ONE
// Business account (identity + KYB + category/pricing + wallet + settlement
// readiness), assembled for the account itself. Non-secret only: never API keys,
// PINs, storage keys, balances, or another tenant's data.
type BusinessResolution struct {
	MerchantID          string
	Handle              string
	BusinessName        string
	BusinessAccountType string
	Status              string
	KybStatus           string
	Verified            bool

	CategoryLabel   string
	PricingCategory string // derived: DONATION | MARKETPLACE | … | ""

	// Pricing rule the OPERATOR would apply for this category (its own fee), if
	// one is configured for the environment. Informational — an app that declares
	// its own application fee (ADR-029) is separate from this.
	PricingProfile string
	PricingRuleKey string
	PricingRuleBps int32
	PricingFound   bool

	WalletID             string
	WalletCurrency       string
	WalletStatus         string
	PrimaryAccountID     string
	ApplicationAccountID string
	WalletReady          bool

	Blockers        []string
	SettlementReady bool
}

// BusinessSelfService resolves the consolidated profile of a Business account
// (identity + profile + KYB + wallet + pricing) from the gateway database.
type BusinessSelfService struct {
	pool *pgxpool.Pool
}

func NewBusinessSelfService(pool *pgxpool.Pool) *BusinessSelfService {
	return &BusinessSelfService{pool: pool}
}

// pricingCategoryFromLabel maps a human category label to a pricing category
// key. DOA-style donation labels resolve to DONATION; unmapped labels return ""
// (reported honestly rather than guessed).
func pricingCategoryFromLabel(label string) string {
	l := strings.ToLower(strings.TrimSpace(label))
	switch {
	case l == "":
		return ""
	case strings.Contains(l, "doaç"), strings.Contains(l, "doac"),
		strings.Contains(l, "donation"), strings.Contains(l, "causa"),
		strings.Contains(l, "crowd"), strings.Contains(l, "vaquinha"):
		return "DONATION"
	case strings.Contains(l, "marketplace"):
		return "MARKETPLACE"
	default:
		return ""
	}
}

// Self resolves the account for the given merchant id (always from the
// authenticated principal — a self lookup, not an oracle). Returns
// ErrMerchantNotFound when the merchant row is absent.
func (s *BusinessSelfService) Self(ctx context.Context, merchantID, environment string) (*BusinessResolution, error) {
	if s == nil || s.pool == nil {
		return nil, errors.New("business self service is not configured")
	}
	env := "LIVE"
	if strings.EqualFold(strings.TrimSpace(environment), "SANDBOX") {
		env = "SANDBOX"
	}

	var (
		r         BusinessResolution
		handle    *string
		display   *string
		category  *string
		walletID  *string
		kybStatus *string
		walCur    *string
		walStatus *string
	)

	err := s.pool.QueryRow(ctx, `
		SELECT m.id::text, m.name, COALESCE(m.status,''),
		       COALESCE(m.business_account_type,'MERCHANT'),
		       mp.handle, mp.display_name, mp.category, mp.wallet_id::text,
		       mc.kyb_status, w.currency, w.status
		  FROM merchants m
		  LEFT JOIN merchant_profiles   mp ON mp.merchant_id = m.id
		  LEFT JOIN merchant_compliance mc ON mc.merchant_id = m.id
		  LEFT JOIN wallets             w  ON w.id = mp.wallet_id
		 WHERE m.id = $1`, merchantID).
		Scan(&r.MerchantID, &r.BusinessName, &r.Status, &r.BusinessAccountType,
			&handle, &display, &category, &walletID, &kybStatus, &walCur, &walStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMerchantNotFound
		}
		return nil, err
	}

	if handle != nil {
		r.Handle = *handle
	}
	if display != nil && strings.TrimSpace(*display) != "" {
		r.BusinessName = *display
	}
	if category != nil {
		r.CategoryLabel = *category
	}
	r.PricingCategory = pricingCategoryFromLabel(r.CategoryLabel)

	r.KybStatus = "PENDING"
	if kybStatus != nil && strings.TrimSpace(*kybStatus) != "" {
		r.KybStatus = *kybStatus
	}
	r.Verified = r.KybStatus == "APPROVED"

	if walletID != nil && strings.TrimSpace(*walletID) != "" {
		r.WalletID = *walletID
		if walCur != nil {
			r.WalletCurrency = *walCur
		}
		if walStatus != nil {
			r.WalletStatus = *walStatus
		}
		// Segregated accounts under the wallet — PRIMARY is created with the
		// wallet; an APPLICATION account (if present) receives app-fee splits.
		rows, aerr := s.pool.Query(ctx,
			`SELECT id::text, purpose, status FROM wallet_accounts WHERE wallet_id = $1`, r.WalletID)
		if aerr == nil {
			defer rows.Close()
			for rows.Next() {
				var id, purpose, st string
				if rows.Scan(&id, &purpose, &st) == nil {
					switch strings.ToUpper(purpose) {
					case "PRIMARY":
						r.PrimaryAccountID = id
					case "APPLICATION", "PLATFORM":
						r.ApplicationAccountID = id
					}
				}
			}
		}
	}
	r.WalletReady = r.WalletID != "" &&
		strings.EqualFold(r.WalletStatus, "ACTIVE") && r.PrimaryAccountID != ""

	// Operator pricing rule for this category (informational).
	if r.PricingCategory != "" {
		var profile *string
		var ruleKey *string
		var bps *int32
		perr := s.pool.QueryRow(ctx, `
			SELECT COALESCE(pricing_profile,''), rule_key, rate_bps
			  FROM pricing_rules
			 WHERE environment = $1 AND enabled
			   AND upper(business_category) = $2
			 ORDER BY priority DESC, version DESC
			 LIMIT 1`, env, r.PricingCategory).Scan(&profile, &ruleKey, &bps)
		if perr == nil {
			r.PricingFound = true
			if profile != nil {
				r.PricingProfile = *profile
			}
			if ruleKey != nil {
				r.PricingRuleKey = *ruleKey
			}
			if bps != nil {
				r.PricingRuleBps = *bps
			}
		} else if !errors.Is(perr, pgx.ErrNoRows) {
			return nil, perr
		}
	}

	// Compute settlement blockers from real state.
	r.Blockers = r.Blockers[:0]
	if !strings.EqualFold(r.Status, string(MerchantStatusActive)) {
		r.Blockers = append(r.Blockers, BlockerBusinessNotActive)
	}
	if r.KybStatus != "APPROVED" {
		r.Blockers = append(r.Blockers, BlockerKybNotApproved)
	}
	if r.WalletID == "" {
		r.Blockers = append(r.Blockers, BlockerWalletMissing)
	} else if r.PrimaryAccountID == "" {
		r.Blockers = append(r.Blockers, BlockerWalletAccountMissing)
	}
	if r.PricingCategory != "" && !r.PricingFound {
		r.Blockers = append(r.Blockers, BlockerPricingMissing)
	}
	r.SettlementReady = len(r.Blockers) == 0

	return &r, nil
}
