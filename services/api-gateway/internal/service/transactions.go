// Package service defines the domain service interfaces consumed by HTTP handlers.
//
// Interfaces are declared here; production implementations will delegate to the
// Rust financial core (banzami-transactions) via gRPC or IPC once the transport
// layer is established. Stub implementations allow the gateway to run locally
// before that transport exists.
package service

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// ErrTransactionNotFound is returned when a transaction does not exist or does
// not belong to the requesting merchant.
var ErrTransactionNotFound = errors.New("transaction not found")

// Transaction is the gateway-level view of a payment transaction.
// It mirrors the response shape exposed to API consumers.
//
// There is deliberately no fee field, and adding one needs more thought than it
// looks like it needs. Core carries `fee` on its own transaction record, and
// before capture that value is 0 because no pricing decision has been made yet
// — a placeholder, not a price. Publishing it would make an undecided
// transaction indistinguishable from one priced at zero, which is the exact
// confusion this whole change exists to remove. If a fee ever becomes public,
// it has to be null while unpriced, not 0.
type Transaction struct {
	ID             string    `json:"id"`
	Status         string    `json:"status"`
	AmountMinor    int64     `json:"amount_minor"`
	Currency       string    `json:"currency"`
	MerchantID     string    `json:"merchant_id"`
	IdempotencyKey string    `json:"idempotency_key"`
	Description    string    `json:"description,omitempty"`
	Environment    string    `json:"environment"` // "LIVE" | "SANDBOX"
	CreatedAt      time.Time `json:"created_at"`
}

// CreateTransactionRequest carries validated, enriched inputs for transaction creation.
type CreateTransactionRequest struct {
	IdempotencyKey  string
	TransactionType string // e.g. "payment"; defaults to "payment" if empty
	AmountMinor     int64
	Currency        string
	Description     string
	MerchantID      string // populated from the authenticated principal, not the request body
	WalletID        string // optional; core derives from merchant context if empty
	Environment     string // "LIVE" | "SANDBOX" — populated from the authenticated principal
	// PricingProfile is the merchant's assigned operator policy, resolved
	// server-side from their own record. It is not a caller input and there is
	// no field for one: business_category and fee_policy_ref were removed with
	// it, because each selects a rule and selecting the rule selects the price.
	PricingProfile string
}

// ListTransactionsRequest parameterises a paginated transaction listing.
type ListTransactionsRequest struct {
	MerchantID  string
	Environment string     // "LIVE" | "SANDBOX" — only return records for this environment
	Cursor      string     // opaque keyset cursor; empty means first page
	Limit       int        // 1–100; callers must clamp before passing
	Since       *time.Time // inclusive lower bound on created_at; nil means no lower bound
}

// TransactionPage is the paginated list response.
type TransactionPage struct {
	Data       []*Transaction `json:"data"`
	NextCursor string         `json:"next_cursor,omitempty"`
	HasMore    bool           `json:"has_more"`
}

// TransactionService is the boundary between the gateway and the financial core.
// The production implementation will:
//  1. Validate inputs against compliance rules
//  2. Run risk assessment
//  3. Post a double-entry ledger entry via banzami-ledger
//  4. Route the payment to the appropriate acquirer via banzami-routing
//
// All operations are scoped to the environment embedded in the request.
// LIVE and SANDBOX transactions are stored and returned independently.
type TransactionService interface {
	Create(ctx context.Context, req CreateTransactionRequest) (*Transaction, error)
	// Get fetches a single transaction. environment must match the record's
	// environment — a SANDBOX principal cannot read LIVE records and vice-versa.
	Get(ctx context.Context, merchantID, id, environment string) (*Transaction, error)
	List(ctx context.Context, req ListTransactionsRequest) (*TransactionPage, error)
}

// ---------------------------------------------------------------------------
// Cursor encoding — opaque to callers
// ---------------------------------------------------------------------------

// encodeCursor serialises (createdAt, id) into a URL-safe base64 string.
func encodeCursor(t time.Time, id string) string {
	raw := fmt.Sprintf("%d:%s", t.UnixNano(), id)
	return base64.URLEncoding.EncodeToString([]byte(raw))
}

// decodeCursor is the inverse of encodeCursor.
func decodeCursor(cursor string) (time.Time, string, error) {
	data, err := base64.URLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, "", errors.New("invalid cursor encoding")
	}
	parts := strings.SplitN(string(data), ":", 2)
	if len(parts) != 2 {
		return time.Time{}, "", errors.New("invalid cursor format")
	}
	nanos, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return time.Time{}, "", errors.New("invalid cursor timestamp")
	}
	return time.Unix(0, nanos).UTC(), parts[1], nil
}
