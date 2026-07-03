package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"time"
)

var ErrRefundNotFound = errors.New("refund not found")

// RefundError carries a core-api refund rejection (status + code + message) so
// the gateway handler can surface it faithfully instead of collapsing every
// core rejection into a 500. Scoped to refunds on purpose.
type RefundError struct {
	Status  int
	Code    string
	Message string
}

func (e *RefundError) Error() string { return e.Code + ": " + e.Message }

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

// Refund mirrors the core response. A refund references a TYPED source
// (BANZA ADR-030): source_type is TRANSACTION (acquiring) or WALLET_PAYMENT.
type Refund struct {
	ID            string     `json:"id"`
	SourceType    string     `json:"source_type"`
	SourceID      string     `json:"source_id"`
	TransactionID *string    `json:"transaction_id"` // acquiring only
	MerchantID    string     `json:"merchant_id"`
	ConsumerID    *string    `json:"consumer_id"` // wallet-native only
	WalletID      string     `json:"wallet_id"`
	AmountMinor   int64      `json:"amount_minor"`
	Currency      string     `json:"currency"`
	Reason        *string    `json:"reason"`
	Status        string     `json:"status"`
	FailureReason *string    `json:"failure_reason"`
	ProcessedAt   *time.Time `json:"processed_at"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type RefundPage struct {
	Data []*Refund `json:"data"`
}

// CreateRefundRequest carries the already-validated, already-mapped typed source.
// CoreSourceType is the core vocabulary ("TRANSACTION" | "WALLET_PAYMENT"); the
// public ACQUIRING_PAYMENT name is mapped to TRANSACTION in the handler.
type CreateRefundRequest struct {
	CoreSourceType string
	SourceID       string
	MerchantID     string
	AmountMinor    int64
	Currency       string
	Reason         string
	IdempotencyKey string
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

type RefundService interface {
	Create(ctx context.Context, req CreateRefundRequest) (*Refund, error)
	Get(ctx context.Context, id, merchantID string) (*Refund, error)
	List(ctx context.Context, sourceID, merchantID string, limit int) (*RefundPage, error)
}

// ---------------------------------------------------------------------------
// CoreApiRefundService — proxies to Rust core-api
// ---------------------------------------------------------------------------

type CoreApiRefundService struct {
	client *CoreApiClient
}

func NewCoreApiRefundService(client *CoreApiClient) *CoreApiRefundService {
	return &CoreApiRefundService{client: client}
}

func (s *CoreApiRefundService) Create(ctx context.Context, req CreateRefundRequest) (*Refund, error) {
	// Forward the EXPLICIT typed source (ADR-030). No transaction_id, no silent
	// default — the source is always fully specified.
	body := map[string]any{
		"source_type":     req.CoreSourceType,
		"source_id":       req.SourceID,
		"merchant_id":     req.MerchantID,
		"amount_minor":    req.AmountMinor,
		"currency":        req.Currency,
		"reason":          req.Reason,
		"idempotency_key": req.IdempotencyKey,
	}
	// Explicit service-auth opt-in: ONLY the Refund boundary carries CORE_INTERNAL_KEY.
	status, raw, err := s.client.postRaw(ctx, "/internal/v1/refunds", body, s.client.internalAuth())
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		var e coreErrBody
		_ = json.Unmarshal(raw, &e)
		code := e.Error.Code
		if code == "" {
			code = "REFUND_FAILED"
		}
		return nil, &RefundError{Status: status, Code: code, Message: e.Error.Message}
	}
	var resp Refund
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("core-api decode: %w", err)
	}
	return &resp, nil
}

func (s *CoreApiRefundService) Get(ctx context.Context, id, merchantID string) (*Refund, error) {
	// Tenant-scoped read (F1): merchant_id is derived from the verified principal
	// and forwarded to Core, which returns the identical not-found for a
	// non-existent or cross-tenant refund.
	var resp Refund
	path := "/internal/v1/refunds/" + id + "?merchant_id=" + url.QueryEscape(merchantID)
	if err := s.client.get(ctx, path, &resp, s.client.internalAuth()); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrRefundNotFound
		}
		return nil, err
	}
	return &resp, nil
}

func (s *CoreApiRefundService) List(ctx context.Context, sourceID, merchantID string, limit int) (*RefundPage, error) {
	if limit <= 0 {
		limit = 20
	}
	path := fmt.Sprintf("/internal/v1/refunds?limit=%d", limit)
	if sourceID != "" {
		path += "&source_id=" + sourceID
	}
	if merchantID != "" {
		path += "&merchant_id=" + merchantID
	}
	var resp RefundPage
	if err := s.client.get(ctx, path, &resp, s.client.internalAuth()); err != nil {
		return nil, err
	}
	return &resp, nil
}
