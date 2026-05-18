package service

import (
	"context"
	"errors"
	"fmt"
	"time"
)

var ErrPaymentRequestNotFound = errors.New("payment request not found")

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type PaymentRequest struct {
	ID              string     `json:"id"`
	RequesterID     string     `json:"requester_id"`
	PayerID         string     `json:"payer_id"`
	AmountMinor     int64      `json:"amount_minor"`
	Currency        string     `json:"currency"`
	Message         *string    `json:"message"`
	Status          string     `json:"status"`
	TransferID      *string    `json:"transfer_id"`
	ExpiresAt       time.Time  `json:"expires_at"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	PaidAt          *time.Time `json:"paid_at"`
	DeclinedAt      *time.Time `json:"declined_at"`
	RequesterHandle *string    `json:"requester_handle"`
	PayerHandle     *string    `json:"payer_handle"`
}

type PaymentRequestPage struct {
	Data []*PaymentRequest `json:"data"`
}

type CreatePaymentRequestReq struct {
	RequesterID    string
	PayerID        string
	AmountMinor    int64
	Currency       string
	Message        string
	IdempotencyKey string
}

type PayPaymentRequestReq struct {
	RequestID      string
	PayerID        string
	IdempotencyKey string
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

type PaymentRequestService interface {
	Create(ctx context.Context, req CreatePaymentRequestReq) (*PaymentRequest, error)
	Get(ctx context.Context, id string) (*PaymentRequest, error)
	List(ctx context.Context, requesterID, payerID, status string, limit int) (*PaymentRequestPage, error)
	Pay(ctx context.Context, req PayPaymentRequestReq) (*PaymentRequest, error)
	Decline(ctx context.Context, requestID, payerID string) (*PaymentRequest, error)
	Cancel(ctx context.Context, requestID, requesterID string) (*PaymentRequest, error)
}

// ---------------------------------------------------------------------------
// CoreApiPaymentRequestService — proxies to Rust core-api
// ---------------------------------------------------------------------------

type CoreApiPaymentRequestService struct {
	client *CoreApiClient
}

func NewCoreApiPaymentRequestService(client *CoreApiClient) *CoreApiPaymentRequestService {
	return &CoreApiPaymentRequestService{client: client}
}

func (s *CoreApiPaymentRequestService) Create(ctx context.Context, req CreatePaymentRequestReq) (*PaymentRequest, error) {
	body := map[string]any{
		"requester_id":    req.RequesterID,
		"payer_id":        req.PayerID,
		"amount_minor":    req.AmountMinor,
		"currency":        req.Currency,
		"message":         req.Message,
		"idempotency_key": req.IdempotencyKey,
	}
	var resp PaymentRequest
	if err := s.client.post(ctx, "/internal/v1/payment-requests", body, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (s *CoreApiPaymentRequestService) Get(ctx context.Context, id string) (*PaymentRequest, error) {
	var resp PaymentRequest
	if err := s.client.get(ctx, "/internal/v1/payment-requests/"+id, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrPaymentRequestNotFound
		}
		return nil, err
	}
	return &resp, nil
}

func (s *CoreApiPaymentRequestService) List(ctx context.Context, requesterID, payerID, status string, limit int) (*PaymentRequestPage, error) {
	if limit <= 0 {
		limit = 20
	}
	path := fmt.Sprintf("/internal/v1/payment-requests?limit=%d", limit)
	if requesterID != "" {
		path += "&requester_id=" + requesterID
	}
	if payerID != "" {
		path += "&payer_id=" + payerID
	}
	if status != "" {
		path += "&status=" + status
	}
	var resp PaymentRequestPage
	if err := s.client.get(ctx, path, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (s *CoreApiPaymentRequestService) Pay(ctx context.Context, req PayPaymentRequestReq) (*PaymentRequest, error) {
	body := map[string]any{
		"payer_id":        req.PayerID,
		"idempotency_key": req.IdempotencyKey,
	}
	var resp PaymentRequest
	if err := s.client.post(ctx, "/internal/v1/payment-requests/"+req.RequestID+"/pay", body, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (s *CoreApiPaymentRequestService) Decline(ctx context.Context, requestID, payerID string) (*PaymentRequest, error) {
	body := map[string]any{"payer_id": payerID}
	var resp PaymentRequest
	if err := s.client.post(ctx, "/internal/v1/payment-requests/"+requestID+"/decline", body, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrPaymentRequestNotFound
		}
		return nil, err
	}
	return &resp, nil
}

func (s *CoreApiPaymentRequestService) Cancel(ctx context.Context, requestID, requesterID string) (*PaymentRequest, error) {
	body := map[string]any{"requester_id": requesterID}
	var resp PaymentRequest
	if err := s.client.post(ctx, "/internal/v1/payment-requests/"+requestID+"/cancel", body, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrPaymentRequestNotFound
		}
		return nil, err
	}
	return &resp, nil
}
