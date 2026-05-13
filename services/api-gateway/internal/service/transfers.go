package service

import (
	"context"
	"errors"
	"time"
)

var ErrTransferNotFound       = errors.New("transfer not found")
var ErrTransferSelfTransfer   = errors.New("cannot transfer to yourself")
var ErrTransferInvalidAmount  = errors.New("amount must be positive")
var ErrTransferInsufficientFunds = errors.New("insufficient funds")
var ErrTransferWalletNotFound = errors.New("sender or recipient wallet not found")
var ErrTransferWalletInactive = errors.New("wallet is not active")

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type TransferMoney struct {
	AmountMinor int64  `json:"amount_minor"`
	Currency    string `json:"currency"`
}

type Transfer struct {
	ID              string        `json:"id"`
	IdempotencyKey  string        `json:"idempotency_key"`
	SenderID        string        `json:"sender_id"`
	RecipientID     string        `json:"recipient_id"`
	Amount          TransferMoney `json:"amount"`
	Currency        string        `json:"currency"`
	Status          string        `json:"status"`
	Description     *string       `json:"description"`
	FailureReason   *string       `json:"failure_reason"`
	LedgerPostingID *string       `json:"ledger_posting_id"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`
}

type TransferPage struct {
	Data       []*Transfer `json:"data"`
	HasMore    bool        `json:"has_more"`
	NextCursor string      `json:"next_cursor,omitempty"`
}

type SendTransferRequest struct {
	IdempotencyKey string
	SenderID       string
	RecipientID    string
	AmountMinor    int64
	Currency       string
	Description    string
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

type TransferService interface {
	Send(ctx context.Context, req SendTransferRequest) (*Transfer, error)
	Get(ctx context.Context, id string) (*Transfer, error)
	List(ctx context.Context, consumerID string, limit int, cursor string) (*TransferPage, error)
}
