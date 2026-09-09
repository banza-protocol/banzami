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
// FeeDestinationCheck answers "can this @banza actually receive the application
// fee?" — one field per condition ADR-028 requires, so a caller learns which one
// failed rather than that something did.
type FeeDestinationCheck struct {
	Handle string `json:"handle"`
	// Resolved says the @banza names a party at all.
	Resolved bool `json:"resolved"`
	// OwnedByCaller: the contract requires an application fee to land in the
	// caller's OWN business account. A destination belonging to somebody else is
	// refused by Core, and saying so here is the difference between a fixable
	// message and a mystery.
	OwnedByCaller bool   `json:"owned_by_caller"`
	WalletActive  bool   `json:"wallet_active"`
	Currency      string `json:"currency"`
	KybApproved   bool   `json:"kyb_approved"`
	// TypeAllowed: only APPLICATION/PLATFORM accounts may take an application fee.
	TypeAllowed bool `json:"type_allowed"`
	Ready       bool `json:"ready"`
	// Blocker names the FIRST unmet condition, in the order Core checks them.
	Blocker string `json:"blocker,omitempty"`
}

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
	// Present only when a fee destination was asked about. Its readiness is
	// reported beside the account's own, never merged into it: a settlement that
	// charges no fee needs no destination, so an unready one is not a blocker on
	// the account.
	FeeDestination *FeeDestinationCheck
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
func (s *BusinessSelfService) Self(ctx context.Context, merchantID, environment, feeDestination string) (*BusinessResolution, error) {
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

	// The wallet is resolved from the merchant that OWNS it, not only from the
	// public profile that happens to point at it.
	//
	// This read `wallets` through `merchant_profiles.wallet_id` alone. That row is
	// written by the @handle onboarding flow and by nothing else, so a Business
	// provisioned through the Developer Platform's own self-service Financial
	// Setup has no profile — and this endpoint told it that it had no wallet, no
	// category and no primary account, then raised WALLET_MISSING as a settlement
	// blocker. All false: Core had created an ACTIVE wallet with a PRIMARY
	// account, payments were settling into it, and `wallets.merchant_id` said so
	// the whole time.
	//
	// It is not one account's misfortune either — 244 merchants hold a wallet with
	// no profile row, including every Sandbox owner the Developer Platform
	// provisions. An integrating application's health view reported itself broken
	// while working, which is worse than reporting nothing.
	//
	// The profile's wallet still wins when it is set, so an onboarded merchant
	// that deliberately points its public profile at one wallet keeps that
	// answer. The owner's own ACTIVE wallet is the fallback, oldest first so the
	// choice is deterministic for an owner holding several.
	err := s.pool.QueryRow(ctx, `
		SELECT m.id::text, m.name, COALESCE(m.status,''),
		       COALESCE(m.business_account_type,'MERCHANT'),
		       COALESCE(mp.handle, hr.handle), mp.display_name, mp.category,
		       COALESCE(w.id, ow.id)::text,
		       mc.kyb_status,
		       COALESCE(w.currency, ow.currency),
		       COALESCE(w.status, ow.status)
		  FROM merchants m
		  LEFT JOIN merchant_profiles   mp ON mp.merchant_id = m.id
		  LEFT JOIN merchant_compliance mc ON mc.merchant_id = m.id
		  LEFT JOIN wallets             w  ON w.id = mp.wallet_id
		  LEFT JOIN LATERAL (
		      SELECT id, currency, status
		        FROM wallets
		       WHERE merchant_id = m.id AND status = 'ACTIVE'
		       ORDER BY created_at
		       LIMIT 1
		  ) ow ON TRUE
		  -- The @banza this Business is actually reachable by. handle_registry is
		  -- the routing table a payment resolves a named party through; the public
		  -- profile is a copy that a self-service Business never has. A developer
		  -- who cannot discover their own handle cannot name themselves as a
		  -- settlement beneficiary or fee destination — which is the whole point of
		  -- having one.
		  LEFT JOIN handle_registry hr
		         ON hr.owner_id = m.id AND hr.owner_type = 'MERCHANT'
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

	// A fee destination, checked as a DESTINATION.
	//
	// The DOA integration reported "integração com problemas" because a local
	// setting expected @doa while the Project key resolved @p1a5f17b3cc7e, and
	// something compared the two as if they were one identity. They are not.
	// Three separate identities exist in an application settlement:
	//
	//   the Project's own financial identity  — from key, project, sealed binding
	//   the platform fee destination          — where the app's commission goes
	//   the campaign beneficiary              — who receives the net
	//
	// All three may legitimately differ, so equality with the caller's own handle
	// proves nothing about any of them. What matters for a fee destination is
	// whether it can actually RECEIVE the fee, which is what ADR-028 states and
	// what Core enforces: it must resolve, be ACTIVE, hold an ACTIVE wallet in the
	// currency, be KYB-approved, be of a type permitted to take an application
	// fee, and belong to the caller.
	//
	// Each of those failing gets its own reason. Collapsing them into one generic
	// "integration has problems" is what left an operator guessing which of six
	// conditions was unmet.
	if strings.TrimSpace(feeDestination) != "" {
		r.FeeDestination = s.checkFeeDestination(ctx, merchantID, feeDestination)
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

// checkFeeDestination walks the same conditions Core enforces on an application
// fee destination (ADR-028), reporting each one rather than a verdict.
//
// It resolves through handle_registry — the one namespace every @banza lookup
// goes through — so a handle that is not registered is simply not resolvable,
// whatever else exists under that name elsewhere.
func (s *BusinessSelfService) checkFeeDestination(ctx context.Context, callerMerchantID, handle string) *FeeDestinationCheck {
	h := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(handle), "@"))
	out := &FeeDestinationCheck{Handle: h}

	var ownerType string
	var ownerID *string
	err := s.pool.QueryRow(ctx,
		`SELECT owner_type, owner_id::text FROM handle_registry WHERE handle = $1`, h).
		Scan(&ownerType, &ownerID)
	if err != nil || ownerID == nil {
		out.Blocker = "FEE_DESTINATION_NOT_FOUND"
		return out
	}
	out.Resolved = true

	// The fee must land in the caller's own account. This is checked before the
	// rest because it is the one an integrator can act on immediately, and
	// because reporting a stranger's compliance state would leak it.
	out.OwnedByCaller = *ownerID == callerMerchantID
	if !out.OwnedByCaller {
		out.Blocker = "FEE_DESTINATION_NOT_OWNED"
		return out
	}

	var status, acctType string
	var kyb *string
	var currency, walletStatus *string
	if err := s.pool.QueryRow(ctx, `
		SELECT m.status, COALESCE(m.business_account_type,'MERCHANT'), c.kyb_status, w.currency, w.status
		  FROM merchants m
		  LEFT JOIN merchant_compliance mc ON mc.merchant_id = m.id
		  LEFT JOIN LATERAL (SELECT kyb_status FROM merchant_compliance WHERE merchant_id = m.id) c ON TRUE
		  LEFT JOIN LATERAL (
		      SELECT currency, status FROM wallets
		       WHERE merchant_id = m.id AND status = 'ACTIVE' ORDER BY created_at LIMIT 1
		  ) w ON TRUE
		 WHERE m.id = $1`, *ownerID).
		Scan(&status, &acctType, &kyb, &currency, &walletStatus); err != nil {
		out.Blocker = "FEE_DESTINATION_NOT_FOUND"
		return out
	}

	if currency != nil {
		out.Currency = *currency
	}
	out.WalletActive = walletStatus != nil && strings.EqualFold(*walletStatus, "ACTIVE")
	out.KybApproved = kyb != nil && *kyb == "APPROVED"
	out.TypeAllowed = acctType == "APPLICATION" || acctType == "PLATFORM"

	switch {
	case !strings.EqualFold(status, string(MerchantStatusActive)):
		out.Blocker = "FEE_DESTINATION_NOT_ACTIVE"
	case !out.WalletActive:
		out.Blocker = "FEE_DESTINATION_WALLET_UNAVAILABLE"
	case !out.KybApproved:
		out.Blocker = "FEE_DESTINATION_KYB_NOT_APPROVED"
	case !out.TypeAllowed:
		out.Blocker = "FEE_DESTINATION_TYPE_NOT_ALLOWED"
	default:
		out.Ready = true
	}
	return out
}
