package service

import (
	"context"
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
	ApplicationID       string     `json:"-"`
	Status              string     `json:"status"`
	GrossAmountMinor    int64      `json:"gross_amount_minor"`
	ApplicationFeeMinor int64      `json:"application_fee_minor"`
	NetAmountMinor      int64      `json:"net_amount_minor"`
	Currency            string     `json:"currency"`
	Environment         string     `json:"environment"`
	CreatedAt           time.Time  `json:"created_at"`
	CompletedAt         *time.Time `json:"completed_at"`
	FailureReason       *string    `json:"failure_reason"`
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
	// ApplicationFeeBps is the app-defined fee rate (ADR-029). When > 0 the
	// operator computes the fee from it and ignores any pricing reference.
	ApplicationFeeBps int
	GrossAmountMinor  int64
	Currency          string
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
}

// coreSettlementResp mirrors the core settlement JSON (Money is nested).
type coreSettlementResp struct {
	ID             string        `json:"id"`
	OwnerRef       string        `json:"owner_ref"`
	ApplicationID  string        `json:"application_id"`
	Status         string        `json:"status"`
	GrossAmount    coreMoneyResp `json:"gross_amount"`
	ApplicationFee coreMoneyResp `json:"application_fee"`
	NetAmount      coreMoneyResp `json:"net_amount"`
	Currency       string        `json:"currency"`
	Environment    string        `json:"environment"`
	CreatedAt      time.Time     `json:"created_at"`
	CompletedAt    *time.Time    `json:"completed_at"`
	FailureReason  *string       `json:"failure_reason"`
}

func (r *coreSettlementResp) toSafe() *ApplicationSettlement {
	return &ApplicationSettlement{
		ID: r.ID, OwnerRef: r.OwnerRef, ApplicationID: r.ApplicationID, Status: r.Status,
		GrossAmountMinor: r.GrossAmount.AmountMinor, ApplicationFeeMinor: r.ApplicationFee.AmountMinor,
		NetAmountMinor: r.NetAmount.AmountMinor, Currency: r.Currency, Environment: r.Environment,
		CreatedAt: r.CreatedAt, CompletedAt: r.CompletedAt, FailureReason: r.FailureReason,
	}
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
	// ADR-029: app-defined fee rate. When set, core ignores pricing references.
	if in.ApplicationFeeBps > 0 {
		body["application_fee_bps"] = in.ApplicationFeeBps
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
	if err := s.client.post(ctx, "/internal/v1/application-settlements/"+id+"/complete", nil, &resp); err != nil {
		return nil, err
	}
	return resp.toSafe(), nil
}

func (s *CoreApiApplicationSettlementService) Get(ctx context.Context, id string) (*ApplicationSettlement, error) {
	var resp coreSettlementResp
	if err := s.client.get(ctx, "/internal/v1/application-settlements/"+id, &resp); err != nil {
		return nil, err
	}
	return resp.toSafe(), nil
}
