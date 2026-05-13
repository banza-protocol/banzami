package service

import (
	"context"
	"errors"
	"fmt"
	"time"
)

var ErrPaymentLinkNotFound  = errors.New("payment link not found")
var ErrPaymentLinkNotActive = errors.New("payment link is not active")

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type PaymentLink struct {
	ID          string     `json:"id"`
	Slug        string     `json:"slug"`
	MerchantID  string     `json:"merchant_id"`
	WalletID    string     `json:"wallet_id"`
	AmountMinor *int64     `json:"amount_minor"`
	Currency    string     `json:"currency"`
	Description *string    `json:"description"`
	Status      string     `json:"status"`
	ExpiresAt   *time.Time `json:"expires_at"`
	PaidAt      *time.Time `json:"paid_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type CreatePaymentLinkRequest struct {
	MerchantID  string
	WalletID    string
	AmountMinor *int64
	Currency    string
	Description *string
	ExpiresAt   *time.Time
}

type ListPaymentLinksRequest struct {
	MerchantID string
	Limit      int64
	Cursor     string
}

type PaymentLinkListPage struct {
	Items      []*PaymentLink `json:"items"`
	NextCursor *string        `json:"next_cursor"`
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

type PaymentLinkService interface {
	Create(ctx context.Context, req CreatePaymentLinkRequest) (*PaymentLink, error)
	Get(ctx context.Context, id string) (*PaymentLink, error)
	GetBySlug(ctx context.Context, slug string) (*PaymentLink, error)
	List(ctx context.Context, req ListPaymentLinksRequest) (*PaymentLinkListPage, error)
	Cancel(ctx context.Context, id string) (*PaymentLink, error)
	MarkUsed(ctx context.Context, id string) (*PaymentLink, error)
}

// ---------------------------------------------------------------------------
// CoreAPI implementation
// ---------------------------------------------------------------------------

type CoreApiPaymentLinkService struct {
	client *CoreApiClient
}

func NewCoreApiPaymentLinkService(client *CoreApiClient) *CoreApiPaymentLinkService {
	return &CoreApiPaymentLinkService{client: client}
}

func (s *CoreApiPaymentLinkService) Create(ctx context.Context, req CreatePaymentLinkRequest) (*PaymentLink, error) {
	body := map[string]any{
		"merchant_id":  req.MerchantID,
		"wallet_id":    req.WalletID,
		"amount_minor": req.AmountMinor,
		"currency":     req.Currency,
		"description":  req.Description,
		"expires_at":   req.ExpiresAt,
	}
	var link PaymentLink
	return &link, s.client.post(ctx, "/internal/v1/payment-links", body, &link)
}

func (s *CoreApiPaymentLinkService) Get(ctx context.Context, id string) (*PaymentLink, error) {
	var link PaymentLink
	if err := s.client.get(ctx, fmt.Sprintf("/internal/v1/payment-links/%s", id), &link); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrPaymentLinkNotFound
		}
		return nil, err
	}
	return &link, nil
}

func (s *CoreApiPaymentLinkService) GetBySlug(ctx context.Context, slug string) (*PaymentLink, error) {
	var link PaymentLink
	if err := s.client.get(ctx, fmt.Sprintf("/internal/v1/payment-links/by-slug/%s", slug), &link); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrPaymentLinkNotFound
		}
		return nil, err
	}
	return &link, nil
}

func (s *CoreApiPaymentLinkService) List(ctx context.Context, req ListPaymentLinksRequest) (*PaymentLinkListPage, error) {
	path := fmt.Sprintf("/internal/v1/payment-links?merchant_id=%s&limit=%d", req.MerchantID, req.Limit)
	if req.Cursor != "" {
		path += "&cursor=" + req.Cursor
	}
	var page PaymentLinkListPage
	return &page, s.client.get(ctx, path, &page)
}

func (s *CoreApiPaymentLinkService) Cancel(ctx context.Context, id string) (*PaymentLink, error) {
	var link PaymentLink
	if err := s.client.post(ctx, fmt.Sprintf("/internal/v1/payment-links/%s/cancel", id), nil, &link); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrPaymentLinkNotFound
		}
		return nil, err
	}
	return &link, nil
}

func (s *CoreApiPaymentLinkService) MarkUsed(ctx context.Context, id string) (*PaymentLink, error) {
	var link PaymentLink
	if err := s.client.post(ctx, fmt.Sprintf("/internal/v1/payment-links/%s/mark-used", id), nil, &link); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrPaymentLinkNotFound
		}
		return nil, err
	}
	return &link, nil
}
