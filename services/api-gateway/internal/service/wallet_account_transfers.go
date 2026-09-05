package service

import (
	"context"
	"time"
)

// Transferências — internal transfer between two wallet accounts of the same
// bound financial owner (Banzami ADR-052).
//
// The gateway resolves the merchant from the caller's authority and passes it to
// Core; nothing here is read from a public request body. Core re-checks that
// BOTH accounts belong to that merchant, so a caller reaching Core directly
// still cannot move another owner's money.

type WalletAccountTransfer struct {
	ID                         string    `json:"id"`
	SourceWalletAccountID      string    `json:"source_wallet_account_id"`
	DestinationWalletAccountID string    `json:"destination_wallet_account_id"`
	AmountMinor                int64     `json:"amount_minor"`
	Currency                   string    `json:"currency"`
	Status                     string    `json:"status"`
	Description                *string   `json:"description,omitempty"`
	CreatedAt                  time.Time `json:"created_at"`
}

type CreateWalletAccountTransferInput struct {
	// Resolved from the caller's authority, never from the request body.
	MerchantID                 string
	SourceWalletAccountID      string
	DestinationWalletAccountID string
	AmountMinor                int64
	Currency                   string
	IdempotencyKey             string
	Description                string
}

type WalletAccountTransferService interface {
	Create(ctx context.Context, in CreateWalletAccountTransferInput) (*WalletAccountTransfer, error)
}

type CoreApiWalletAccountTransferService struct{ client *CoreApiClient }

func NewCoreApiWalletAccountTransferService(c *CoreApiClient) *CoreApiWalletAccountTransferService {
	return &CoreApiWalletAccountTransferService{client: c}
}

func (s *CoreApiWalletAccountTransferService) Create(
	ctx context.Context, in CreateWalletAccountTransferInput,
) (*WalletAccountTransfer, error) {
	body := map[string]any{
		"merchant_id":                   in.MerchantID,
		"source_wallet_account_id":      in.SourceWalletAccountID,
		"destination_wallet_account_id": in.DestinationWalletAccountID,
		"amount_minor":                  in.AmountMinor,
		"currency":                      in.Currency,
		"idempotency_key":               in.IdempotencyKey,
	}
	if in.Description != "" {
		body["description"] = in.Description
	}
	var resp WalletAccountTransfer
	if err := s.client.post(ctx, "/internal/v1/wallet-account-transfers", body, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}
