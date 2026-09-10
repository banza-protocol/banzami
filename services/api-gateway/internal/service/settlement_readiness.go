package service

import "context"

// SettlementReadiness is core's answer to "can this financial owner settle?",
// computed by the code that settles (core/api/src/routes/settlement_readiness.rs).
// The gateway projects it; it never recomputes a rule. It carries no internal
// identifier — no merchant, wallet, account or rule id.
type SettlementReadiness struct {
	FinancialIdentity struct {
		Handle *string `json:"handle"`
	} `json:"financial_identity"`
	Kyb struct {
		Status string `json:"status"`
	} `json:"kyb"`
	Wallet struct {
		Status   *string `json:"status"`
		Currency string  `json:"currency"`
		Ready    bool    `json:"ready"`
	} `json:"wallet"`
	Pricing struct {
		Profile       *string `json:"profile"`
		Configured    bool    `json:"configured"`
		SettlementBps *uint32 `json:"settlement_bps"`
		PayoutBps     *uint32 `json:"payout_bps"`
	} `json:"pricing"`
	FeeDestination struct {
		Handle                     *string `json:"handle"`
		Required                   bool    `json:"required"`
		Resolved                   bool    `json:"resolved"`
		OwnedByProject             bool    `json:"owned_by_project"`
		Active                     bool    `json:"active"`
		KybApproved                bool    `json:"kyb_approved"`
		WalletActive               bool    `json:"wallet_active"`
		TypeAllowed                bool    `json:"type_allowed"`
		ApplicationAccountRequired bool    `json:"application_account_required"`
		Eligible                   bool    `json:"eligible"`
		Blocker                    *string `json:"blocker"`
	} `json:"fee_destination"`
	Settlement struct {
		Ready    bool     `json:"ready"`
		Blockers []string `json:"blockers"`
		Warnings []string `json:"warnings"`
	} `json:"settlement"`
}

// ReadinessFeeDestination is a fee destination the caller named, already
// resolved from its @banza. Nil: the owner's own financial identity.
type ReadinessFeeDestination struct {
	Handle string
	// AccountID is empty when the handle resolved to nothing.
	AccountID string
	Owned     bool
}

type SettlementReadinessService interface {
	Readiness(ctx context.Context, merchantID, currency string, fee *ReadinessFeeDestination) (*SettlementReadiness, error)
}

type CoreApiSettlementReadinessService struct{ client *CoreApiClient }

func NewCoreApiSettlementReadinessService(c *CoreApiClient) *CoreApiSettlementReadinessService {
	return &CoreApiSettlementReadinessService{client: c}
}

// Readiness returns ErrNotFound when core has no such owner, a *CoreError for
// any other refusal, and a *TransportError when core could not be reached.
func (s *CoreApiSettlementReadinessService) Readiness(ctx context.Context, merchantID, currency string, fee *ReadinessFeeDestination) (*SettlementReadiness, error) {
	body := map[string]any{"merchant_id": merchantID, "currency": currency}
	if fee != nil {
		fd := map[string]any{"handle": fee.Handle, "owned": fee.Owned}
		if fee.AccountID != "" {
			fd["account_id"] = fee.AccountID
		}
		body["fee_destination"] = fd
	}
	var out SettlementReadiness
	if err := s.client.post(ctx, "/internal/v1/settlement-readiness", body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
