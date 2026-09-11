package service

import (
	"context"
	"net/url"
	"time"
)

// WalletAccount is the SAFE, app-facing view of a segregated account (ADR-042):
// purpose + reference + balance + status. The ledger account_id is never exposed.
type WalletAccount struct {
	ID                    string    `json:"id"`
	WalletID              string    `json:"wallet_id"`
	Purpose               string    `json:"purpose"`
	ReferenceType         *string   `json:"reference_type"`
	ReferenceID           *string   `json:"reference_id"`
	Label                 *string   `json:"label"`
	Status                string    `json:"status"`
	AvailableBalanceMinor int64     `json:"available_balance_minor"`
	Currency              string    `json:"currency"`
	CreatedAt             time.Time `json:"created_at"`
}

type coreWalletAccountResp struct {
	ID                    string    `json:"id"`
	WalletID              string    `json:"wallet_id"`
	AccountID             string    `json:"account_id"` // ledger internal — stripped by toSafe
	Purpose               string    `json:"purpose"`
	ReferenceType         *string   `json:"reference_type"`
	ReferenceID           *string   `json:"reference_id"`
	Label                 *string   `json:"label"`
	Status                string    `json:"status"`
	AvailableBalanceMinor int64     `json:"available_balance_minor"`
	Currency              string    `json:"currency"`
	CreatedAt             time.Time `json:"created_at"`
}

func (r *coreWalletAccountResp) toSafe() *WalletAccount {
	return &WalletAccount{
		ID: r.ID, WalletID: r.WalletID, Purpose: r.Purpose, ReferenceType: r.ReferenceType,
		ReferenceID: r.ReferenceID, Label: r.Label, Status: r.Status,
		AvailableBalanceMinor: r.AvailableBalanceMinor, Currency: r.Currency, CreatedAt: r.CreatedAt,
	}
}

type CreateWalletAccountInput struct {
	WalletID      string
	MerchantID    string
	Purpose       string
	ReferenceType string
	ReferenceID   string
	Label         string
}

type WalletAccountService interface {
	Create(ctx context.Context, in CreateWalletAccountInput) (*WalletAccount, error)
	ListForWallet(ctx context.Context, walletID string) ([]*WalletAccount, error)
	Get(ctx context.Context, id string) (*WalletAccount, error)
	Resolve(ctx context.Context, walletID, purpose, refType, refID string) (*WalletAccount, error)
	// CoreAccountID returns the ledger account_id backing a wallet account. Gateway-
	// internal only (used to set an Application Settlement source) — never exposed.
	CoreAccountID(ctx context.Context, walletAccountID string) (string, error)
}

type CoreApiWalletAccountService struct{ client *CoreApiClient }

func NewCoreApiWalletAccountService(c *CoreApiClient) *CoreApiWalletAccountService {
	return &CoreApiWalletAccountService{client: c}
}

func (s *CoreApiWalletAccountService) Create(ctx context.Context, in CreateWalletAccountInput) (*WalletAccount, error) {
	body := map[string]any{"wallet_id": in.WalletID, "merchant_id": in.MerchantID, "purpose": in.Purpose}
	if in.ReferenceType != "" {
		body["reference_type"] = in.ReferenceType
	}
	if in.ReferenceID != "" {
		body["reference_id"] = in.ReferenceID
	}
	if in.Label != "" {
		body["label"] = in.Label
	}
	var resp coreWalletAccountResp
	if err := s.client.post(ctx, "/internal/v1/wallet-accounts", body, &resp); err != nil {
		return nil, err
	}
	return resp.toSafe(), nil
}

func (s *CoreApiWalletAccountService) ListForWallet(ctx context.Context, walletID string) ([]*WalletAccount, error) {
	var resp struct {
		Data []coreWalletAccountResp `json:"data"`
	}
	if err := s.client.get(ctx, "/internal/v1/wallets/"+url.PathEscape(walletID)+"/accounts", &resp); err != nil {
		return nil, err
	}
	out := make([]*WalletAccount, len(resp.Data))
	for i := range resp.Data {
		out[i] = resp.Data[i].toSafe()
	}
	return out, nil
}

func (s *CoreApiWalletAccountService) Get(ctx context.Context, id string) (*WalletAccount, error) {
	var r coreWalletAccountResp
	if err := s.client.get(ctx, "/internal/v1/wallet-accounts/"+url.PathEscape(id), &r); err != nil {
		return nil, err
	}
	return r.toSafe(), nil
}

func (s *CoreApiWalletAccountService) Resolve(ctx context.Context, walletID, purpose, refType, refID string) (*WalletAccount, error) {
	q := url.Values{}
	q.Set("wallet_id", walletID)
	q.Set("purpose", purpose)
	if refType != "" {
		q.Set("reference_type", refType)
	}
	if refID != "" {
		q.Set("reference_id", refID)
	}
	var r coreWalletAccountResp
	if err := s.client.get(ctx, "/internal/v1/wallet-accounts/resolve?"+q.Encode(), &r); err != nil {
		return nil, err
	}
	return r.toSafe(), nil
}

func (s *CoreApiWalletAccountService) CoreAccountID(ctx context.Context, walletAccountID string) (string, error) {
	var r coreWalletAccountResp
	if err := s.client.get(ctx, "/internal/v1/wallet-accounts/"+url.PathEscape(walletAccountID), &r); err != nil {
		return "", err
	}
	return r.AccountID, nil
}
