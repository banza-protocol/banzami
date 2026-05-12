// Package service defines the domain service interfaces consumed by HTTP handlers.
//
// Interfaces are declared here; production implementations will delegate to the
// Rust financial core (banzami-transactions) via gRPC or IPC once the transport
// layer is established. Stub implementations allow the gateway to run locally
// before that transport exists.
package service

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Transaction is the gateway-level view of a payment transaction.
// It mirrors the response shape exposed to API consumers.
type Transaction struct {
	ID             string    `json:"id"`
	Status         string    `json:"status"`
	AmountMinor    int64     `json:"amount_minor"`
	Currency       string    `json:"currency"`
	MerchantID     string    `json:"merchant_id"`
	IdempotencyKey string    `json:"idempotency_key"`
	CreatedAt      time.Time `json:"created_at"`
}

// CreateTransactionRequest carries validated, enriched inputs for transaction creation.
type CreateTransactionRequest struct {
	IdempotencyKey string
	AmountMinor    int64
	Currency       string
	Description    string
	MerchantID     string // populated from the authenticated principal, not the request body
}

// TransactionService is the boundary between the gateway and the financial core.
// The production implementation will:
//  1. Validate inputs against compliance rules
//  2. Run risk assessment
//  3. Post a double-entry ledger entry via banzami-ledger
//  4. Route the payment to the appropriate acquirer via banzami-routing
type TransactionService interface {
	Create(ctx context.Context, req CreateTransactionRequest) (*Transaction, error)
}

// ---------------------------------------------------------------------------
// Stub — local development only
// ---------------------------------------------------------------------------

// StubTransactionService returns synthetic transactions without hitting the
// Rust core. Replace with the real gRPC client once the transport is ready.
type StubTransactionService struct{}

func (s *StubTransactionService) Create(_ context.Context, req CreateTransactionRequest) (*Transaction, error) {
	return &Transaction{
		ID:             uuid.NewString(),
		Status:         "PENDING",
		AmountMinor:    req.AmountMinor,
		Currency:       req.Currency,
		MerchantID:     req.MerchantID,
		IdempotencyKey: req.IdempotencyKey,
		CreatedAt:      time.Now().UTC(),
	}, nil
}
