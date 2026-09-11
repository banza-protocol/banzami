package service

import (
	"context"
	"net/url"
	"time"
)

// ApplicationSettlement is the SAFE, app-facing view of a settlement — amounts +
// status only. Ledger account ids and posting ids are deliberately omitted: an
// external app never sees the ledger internals.
type ApplicationSettlement struct {
	ID       string `json:"id"`
	OwnerRef string `json:"owner_ref"`
	// ApplicationID is the Business Account (merchant) that created this
	// settlement — the authorisation binding used to scope reads (SEC-002).
	// It is gateway-internal: `json:"-"` keeps it out of the app-facing payload,
	// which stays amounts + status only.
	ApplicationID string `json:"-"`
	// The accounts it moved value between — gateway-internal, used to tell a
	// retry of this settlement from a different request under the same key.
	SourceAccountID      string `json:"-"`
	BeneficiaryAccountID string `json:"-"`
	Status               string `json:"status"`
	GrossAmountMinor     int64  `json:"gross_amount_minor"`
	ApplicationFeeMinor  int64  `json:"application_fee_minor"`
	NetAmountMinor       int64  `json:"net_amount_minor"`
	Currency             string `json:"currency"`
	Environment          string `json:"environment"`
	// Pricing is the operator's decision as it was applied to THIS settlement,
	// read from the snapshot core stores with it. It is not re-derived from the
	// pricing tables on read, so repricing a profile later cannot change what a
	// completed settlement says it cost.
	Pricing       *SettlementPricing `json:"pricing"`
	CreatedAt     time.Time          `json:"created_at"`
	CompletedAt   *time.Time         `json:"completed_at"`
	FailureReason *string            `json:"failure_reason"`
}

// SettlementPricing is the applied pricing truth of one settlement.
type SettlementPricing struct {
	Profile    string `json:"profile"`
	AppliedBps uint32 `json:"applied_bps"`
	FlatMinor  int64  `json:"flat_minor"`
}

// CreateApplicationSettlementInput is what the gateway sends to core. The gateway
// passes wallet ids + the gross it read from the source wallet; the fee is resolved
// by the Pricing Engine from fee_policy_ref (never a number).
type CreateApplicationSettlementInput struct {
	IdempotencyKey string
	OwnerRef       string
	// ApplicationID binds the settlement to the Business Account that created
	// it, so a later read can be authorised (SEC-002). Always set by the handler
	// from the authenticated principal — never from the request body.
	ApplicationID  string
	SourceWalletID string
	// SourceAccountID, when set, settles FROM a specific segregated wallet account
	// (ADR-042 — e.g. a DOA campaign account) instead of the wallet's default
	// account. The gateway resolves it from a wallet_account it has verified the
	// caller owns; only this ledger account is debited. Takes precedence over
	// SourceWalletID.
	SourceAccountID     string
	BeneficiaryWalletID string
	// BeneficiaryAccountID / ApplicationFeeAccountID are resolved ledger accounts
	// (ADR-029, e.g. from a @banza handle). Take precedence over the wallet ids.
	BeneficiaryAccountID    string
	ApplicationFeeAccountID string
	ApplicationFeeWalletID  string
	// There is no rate field. One used to exist (ADR-029 "app-defined"), and a
	// non-zero value made core skip pricing and charge what the caller asked.
	GrossAmountMinor int64
	Currency         string
	// The merchant's assigned operator policy, resolved server-side. As on
	// transactions, fee_policy_ref and business_category are gone rather than
	// merely unused: a field that still exists is a field something can start
	// populating again.
	PricingProfile string
}

type ApplicationSettlementService interface {
	Create(ctx context.Context, in CreateApplicationSettlementInput) (*ApplicationSettlement, error)
	Complete(ctx context.Context, id string) (*ApplicationSettlement, error)
	Get(ctx context.Context, id string) (*ApplicationSettlement, error)
	// ByIdempotencyKey is the settlement a key already produced, or ErrNotFound.
	ByIdempotencyKey(ctx context.Context, applicationID, key string) (*ApplicationSettlement, error)
}

// coreSettlementResp mirrors the core settlement JSON (Money is nested).
type coreSettlementResp struct {
	ID             string        `json:"id"`
	OwnerRef       string        `json:"owner_ref"`
	ApplicationID  string        `json:"application_id"`
	SourceAccount  string        `json:"source_account_id"`
	Beneficiary    string        `json:"beneficiary_account_id"`
	Status         string        `json:"status"`
	GrossAmount    coreMoneyResp `json:"gross_amount"`
	ApplicationFee coreMoneyResp `json:"application_fee"`
	NetAmount      coreMoneyResp `json:"net_amount"`
	Currency       string        `json:"currency"`
	Environment    string        `json:"environment"`
	CreatedAt      time.Time     `json:"created_at"`
	CompletedAt    *time.Time    `json:"completed_at"`
	FailureReason  *string       `json:"failure_reason"`
	// The snapshot core wrote when it priced the settlement.
	PricingSnapshot *struct {
		PricingProfile *string `json:"pricing_profile"`
		RateBps        uint32  `json:"rate_bps"`
		FlatMinor      int64   `json:"flat_minor"`
	} `json:"pricing_snapshot_json"`
}

func (r *coreSettlementResp) toSafe() *ApplicationSettlement {
	out := &ApplicationSettlement{
		ID: r.ID, OwnerRef: r.OwnerRef, ApplicationID: r.ApplicationID, Status: r.Status,
		SourceAccountID: r.SourceAccount, BeneficiaryAccountID: r.Beneficiary,
		GrossAmountMinor: r.GrossAmount.AmountMinor, ApplicationFeeMinor: r.ApplicationFee.AmountMinor,
		NetAmountMinor: r.NetAmount.AmountMinor, Currency: r.Currency, Environment: r.Environment,
		CreatedAt: r.CreatedAt, CompletedAt: r.CompletedAt, FailureReason: r.FailureReason,
	}
	if ps := r.PricingSnapshot; ps != nil {
		p := &SettlementPricing{AppliedBps: ps.RateBps, FlatMinor: ps.FlatMinor}
		if ps.PricingProfile != nil {
			p.Profile = *ps.PricingProfile
		}
		out.Pricing = p
	}
	return out
}

type CoreApiApplicationSettlementService struct{ client *CoreApiClient }

func NewCoreApiApplicationSettlementService(c *CoreApiClient) *CoreApiApplicationSettlementService {
	return &CoreApiApplicationSettlementService{client: c}
}

func (s *CoreApiApplicationSettlementService) Create(ctx context.Context, in CreateApplicationSettlementInput) (*ApplicationSettlement, error) {
	body := map[string]any{
		"idempotency_key":    in.IdempotencyKey,
		"owner_ref":          in.OwnerRef,
		"gross_amount_minor": in.GrossAmountMinor,
		"currency":           in.Currency,
	}
	// SEC-002: record the creating Business Account so reads can be scoped to it.
	if in.ApplicationID != "" {
		body["application_id"] = in.ApplicationID
	}
	// Beneficiary: a resolved account (ADR-029 @handle) wins over a wallet id.
	if in.BeneficiaryAccountID != "" {
		body["beneficiary_account_id"] = in.BeneficiaryAccountID
	} else {
		body["beneficiary_wallet_id"] = in.BeneficiaryWalletID
	}
	// Settle from a specific segregated account when given (ADR-042); otherwise
	// from the wallet's default account. Core debits exactly the source account.
	if in.SourceAccountID != "" {
		body["source_account_id"] = in.SourceAccountID
	} else {
		body["source_wallet_id"] = in.SourceWalletID
	}
	// Application fee destination: a resolved account wins over a wallet id.
	if in.ApplicationFeeAccountID != "" {
		body["application_fee_account_id"] = in.ApplicationFeeAccountID
	} else if in.ApplicationFeeWalletID != "" {
		body["application_fee_wallet_id"] = in.ApplicationFeeWalletID
	}
	if in.PricingProfile != "" {
		body["pricing_profile"] = in.PricingProfile
	}
	var resp coreSettlementResp
	if err := s.client.post(ctx, "/internal/v1/application-settlements", body, &resp); err != nil {
		return nil, err
	}
	return resp.toSafe(), nil
}

func (s *CoreApiApplicationSettlementService) Complete(ctx context.Context, id string) (*ApplicationSettlement, error) {
	var resp coreSettlementResp
	if err := s.client.post(ctx, "/internal/v1/application-settlements/"+url.PathEscape(id)+"/complete", nil, &resp); err != nil {
		return nil, err
	}
	return resp.toSafe(), nil
}

func (s *CoreApiApplicationSettlementService) Get(ctx context.Context, id string) (*ApplicationSettlement, error) {
	var resp coreSettlementResp
	if err := s.client.get(ctx, "/internal/v1/application-settlements/"+url.PathEscape(id), &resp); err != nil {
		return nil, err
	}
	return resp.toSafe(), nil
}

// ByIdempotencyKey answers with the caller's OWN settlement under that key.
// A key belongs to the Business that chose it (A1-06): another Business's key
// is not found here, and its settlement is never handed over.
func (s *CoreApiApplicationSettlementService) ByIdempotencyKey(ctx context.Context, applicationID, key string) (*ApplicationSettlement, error) {
	var resp coreSettlementResp
	path := "/internal/v1/application-settlements/by-idempotency-key/" + url.PathEscape(key) +
		"?application_id=" + url.QueryEscape(applicationID)
	if err := s.client.get(ctx, path, &resp); err != nil {
		return nil, err
	}
	return resp.toSafe(), nil
}
