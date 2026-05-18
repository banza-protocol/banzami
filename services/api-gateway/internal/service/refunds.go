package service

import (
	"context"
	"errors"
	"fmt"
	"time"
)

var ErrRefundNotFound = errors.New("refund not found")

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type Refund struct {
	ID            string     `json:"id"`
	TransactionID string     `json:"transaction_id"`
	MerchantID    string     `json:"merchant_id"`
	ConsumerID    *string    `json:"consumer_id"`
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

type CreateRefundRequest struct {
	TransactionID  string
	MerchantID     string
	AmountMinor    int64
	Reason         string
	IdempotencyKey string
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

type RefundService interface {
	Create(ctx context.Context, req CreateRefundRequest) (*Refund, error)
	Get(ctx context.Context, id string) (*Refund, error)
	List(ctx context.Context, transactionID, merchantID string, limit int) (*RefundPage, error)
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
	body := map[string]any{
		"transaction_id":  req.TransactionID,
		"merchant_id":     req.MerchantID,
		"amount_minor":    req.AmountMinor,
		"reason":          req.Reason,
		"idempotency_key": req.IdempotencyKey,
	}
	var resp Refund
	if err := s.client.post(ctx, "/internal/v1/refunds", body, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (s *CoreApiRefundService) Get(ctx context.Context, id string) (*Refund, error) {
	var resp Refund
	if err := s.client.get(ctx, "/internal/v1/refunds/"+id, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrRefundNotFound
		}
		return nil, err
	}
	return &resp, nil
}

func (s *CoreApiRefundService) List(ctx context.Context, transactionID, merchantID string, limit int) (*RefundPage, error) {
	if limit <= 0 {
		limit = 20
	}
	path := fmt.Sprintf("/internal/v1/refunds?limit=%d", limit)
	if transactionID != "" {
		path += "&transaction_id=" + transactionID
	}
	if merchantID != "" {
		path += "&merchant_id=" + merchantID
	}
	var resp RefundPage
	if err := s.client.get(ctx, path, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}
