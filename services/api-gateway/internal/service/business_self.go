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
	BlockerBusinessNotActive    = "BUSINESS_NOT_ACTIVE"
	BlockerKybNotApproved       = "KYB_NOT_APPROVED"
	BlockerWalletMissing        = "WALLET_MISSING"
	BlockerWalletAccountMissing = "WALLET_ACCOUNT_MISSING"
	BlockerPricingMissing       = "PRICING_MISSING"

	// WarnWebhookEndpointMissing is ADVISORY (not a settlement blocker): with no
	// active webhook endpoint the app depends on client-side polling and may miss
	// confirmations. Reconciliation is the backstop; the app should register a
	// webhook. Surfaced in Warnings, never in Blockers.
	WarnWebhookEndpointMissing = "WEBHOOK_ENDPOINT_MISSING"
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

	CategoryLabel string
	Subcategory   string // captured at onboarding (merchant_applications)

	// The operator pricing policy ASSIGNED to this account, and the rate it
	// resolves for each fee-bearing operation. Informational — an app that
	// declares its own application fee (ADR-029) is separate from this.
	//
	// This used to derive a "pricing category" by substring-matching the free
	// text label the merchant typed at onboarding — "doaç" meant DONATION — and
	// then look up a rule keyed on that category. It reported a rate the account
	// would never be charged, and raised a settlement BLOCKER when the lookup
	// failed, which after the pricing model landed was always. No rule is keyed
	// on a category any more, and a business does not choose its own tariff by
	// how it describes itself.
	PricingProfile string
	PricingRules   []OperationRate
	PricingFound   bool

	WalletID             string
	WalletCurrency       string
	WalletStatus         string
	PrimaryAccountID     string
	ApplicationAccountID string
	WalletReady          bool

	Blockers        []string
	Warnings        []string // advisory (does not block settlement) — e.g. WEBHOOK_ENDPOINT_MISSING
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

// OperationRate is one fee-bearing operation and what the account's assigned
// policy charges for it.
type OperationRate struct {
	Operation string `json:"operation"`
	RateBps   int32  `json:"rate_bps"`
	RuleKey   string `json:"rule_key"`
}

// Self resolves the account for the given merchant id (always from the
// authenticated principal — a self lookup, not an oracle). Returns
// ErrMerchantNotFound when the merchant row is absent.
func (s *BusinessSelfService) Self(ctx context.Context, merchantID, environment string) (*BusinessResolution, error) {
	if s == nil || s.pool == nil {
		return nil, errors.New("business self service is not configured")
	}
	// `environment` no longer selects anything here. The rates below come from
	// the profile assigned to this owner, and a profile carries its own
	// environment — an owner cannot be assigned a LIVE profile on a Sandbox
	// deployment (merchants_pricing_env enforces it in the database).
	_ = environment

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

	// Subcategory is captured at onboarding but not copied to the public profile;
	// resolve it from the approved application (linked by the desired handle).
	if r.Handle != "" {
		var sub *string
		serr := s.pool.QueryRow(ctx, `
			SELECT subcategory FROM merchant_applications
			 WHERE desired_handle = $1 AND status = 'APPROVED'
			   AND subcategory IS NOT NULL AND subcategory <> ''
			 ORDER BY created_at DESC LIMIT 1`, r.Handle).Scan(&sub)
		if serr == nil && sub != nil {
			r.Subcategory = *sub
		} else if serr != nil && !errors.Is(serr, pgx.ErrNoRows) {
			return nil, serr
		}
	}

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

	// The rates this account is actually charged: resolved the same way the
	// settlement and payout paths resolve them — from the profile an operator
	// ASSIGNED to this owner, per fee-bearing operation. Nothing here reads a
	// label, and nothing a merchant can type changes what comes back.
	rows, perr := s.pool.Query(ctx, `
		SELECT pp.code, r.pricing_operation, r.rate_bps, r.rule_key
		  FROM merchants m
		  JOIN pricing_profiles pp ON pp.id = m.pricing_profile_id
		  JOIN pricing_rules r ON r.pricing_profile = pp.code
		                      AND r.environment = pp.environment
		 WHERE m.id = $1 AND pp.enabled AND r.enabled
		   AND r.pricing_operation IS NOT NULL
		   AND (r.effective_from IS NULL OR r.effective_from <= now())
		   AND (r.effective_to   IS NULL OR r.effective_to   >  now())
		 ORDER BY r.pricing_operation`, merchantID)
	if perr != nil {
		return nil, perr
	}
	for rows.Next() {
		var code, op, key string
		var bps int32
		if err := rows.Scan(&code, &op, &bps, &key); err != nil {
			rows.Close()
			return nil, err
		}
		r.PricingProfile = code
		r.PricingRules = append(r.PricingRules, OperationRate{Operation: op, RateBps: bps, RuleKey: key})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	r.PricingFound = len(r.PricingRules) > 0

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
	// An owner with no priced policy cannot settle: the resolver refuses rather
	// than charging zero. That is a genuine blocker, and unlike the old one it
	// reflects the assignment an operator made rather than a word in a label.
	if !r.PricingFound {
		r.Blockers = append(r.Blockers, BlockerPricingMissing)
	}
	r.SettlementReady = len(r.Blockers) == 0

	// Advisory warnings (do NOT affect SettlementReady). No active webhook endpoint
	// ⇒ the app relies on polling and may miss confirmations — recommend registering
	// one. Best-effort: a query error simply omits the warning.
	r.Warnings = r.Warnings[:0]
	var hasWebhook bool
	if err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM webhook_endpoints WHERE merchant_id = $1 AND active = true)`,
		merchantID,
	).Scan(&hasWebhook); err == nil && !hasWebhook {
		r.Warnings = append(r.Warnings, WarnWebhookEndpointMissing)
	}

	return &r, nil
}

// PricingProfileForMerchant resolves the operator-governed pricing policy that
// applies to a merchant, from the merchant's own assignment.
//
// This replaces reading a category — from the request, and then from the
// merchant's KYB description — as the thing that chooses a rate. Both were
// wrong in the same way: one let the caller pick its own tariff, and the other
// let a substring of prose pick it, so a shop whose description mentioned
// donations was priced as a donation platform.
//
// Empty means UNPRICED, and unpriced is not free: the settlement path refuses
// it. That distinction is the entire point of the change — "no rule matched" and
// "the rule says zero" produce the same number in a fee column and are
// completely different facts.
func (s *BusinessSelfService) PricingProfileForMerchant(ctx context.Context, merchantID string) (string, error) {
	if s == nil || s.pool == nil {
		return "", errors.New("business self service is not configured")
	}
	var code *string
	err := s.pool.QueryRow(ctx,
		`SELECT p.code
		   FROM merchants m
		   JOIN pricing_profiles p ON p.id = m.pricing_profile_id
		  WHERE m.id = $1 AND p.enabled AND p.environment = 'SANDBOX'`, merchantID).Scan(&code)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	if code == nil {
		return "", nil
	}
	return *code, nil
}
