package service

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"time"
)

var ErrPaymentLinkNotFound = errors.New("payment link not found")
var ErrPaymentLinkNotActive = errors.New("payment link is not active")

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type PaymentLink struct {
	ID              string     `json:"id"`
	Slug            string     `json:"slug"`
	MerchantID      string     `json:"merchant_id"`
	WalletID        string     `json:"wallet_id"`
	WalletAccountID string     `json:"wallet_account_id"`
	AmountMinor     *int64     `json:"amount_minor"`
	Currency        string     `json:"currency"`
	Description     *string    `json:"description"`
	Status          string     `json:"status"`
	ExpiresAt       *time.Time `json:"expires_at"`
	PaidAt          *time.Time `json:"paid_at"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	// Merchant-safe refundable-source discovery (operator extension). Set by Core
	// only after a wallet payment has settled for this link; surfaced to the
	// owning merchant only (Get strips it for non-owners) and carried on the
	// payment_link.paid webhook. Never the internal TRANSACTION token.
	RefundSource *RefundSource `json:"refund_source,omitempty"`
}

type CreatePaymentLinkRequest struct {
	MerchantID      string
	WalletID        string
	WalletAccountID string
	AmountMinor     *int64
	Currency        string
	Description     *string
	ExpiresAt       *time.Time
}

type ListPaymentLinksRequest struct {
	MerchantID string
	Limit      int64
	Cursor     string
}

type PaymentLinkListPage struct {
	Items      []*PaymentLink `json:"data"`
	NextCursor *string        `json:"next_cursor,omitempty"`
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
	if req.WalletAccountID != "" {
		body["wallet_account_id"] = req.WalletAccountID
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

// PaymentLinkSlugPattern is the one spelling a slug has: 12 lower-case hex
// characters (core payment-links generate_slug). Anything else is not a slug.
var PaymentLinkSlugPattern = regexp.MustCompile(`^[0-9a-f]{12}$`)

func (s *CoreApiPaymentLinkService) GetBySlug(ctx context.Context, slug string) (*PaymentLink, error) {
	// The slug arrives already decoded by the router and was pasted into core's
	// URL, which decodes it again: %2541… and <slug>%3Fx resolved to a link. A
	// public link identifier is exact — checked here, then escaped.
	if !PaymentLinkSlugPattern.MatchString(slug) {
		return nil, ErrPaymentLinkNotFound
	}
	var link PaymentLink
	if err := s.client.get(ctx, "/internal/v1/payment-links/by-slug/"+url.PathEscape(slug), &link); err != nil {
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

// mapPaymentLinkCoreError turns core's declared refusals into the sentinels the
// handler already branches on.
//
// Core answers 422 LINK_NOT_ACTIVE for an invalid state transition — cancelling
// an already-cancelled link, marking a cancelled link used. That was never mapped
// here, so the handler's LINK_NOT_ACTIVE branch could not fire and the error fell
// through to a 500: an invalid transition reported as a server fault. The same
// class as RA-043, on a path that had its own sentinel waiting for it.
func mapPaymentLinkCoreError(err error) error {
	if errors.Is(err, ErrNotFound) {
		return ErrPaymentLinkNotFound
	}
	if ce, ok := AsCoreError(err); ok && ce.Code == "LINK_NOT_ACTIVE" {
		return ErrPaymentLinkNotActive
	}
	return err
}

func (s *CoreApiPaymentLinkService) Cancel(ctx context.Context, id string) (*PaymentLink, error) {
	var link PaymentLink
	if err := s.client.post(ctx, fmt.Sprintf("/internal/v1/payment-links/%s/cancel", id), nil, &link); err != nil {
		return nil, mapPaymentLinkCoreError(err)
	}
	return &link, nil
}

func (s *CoreApiPaymentLinkService) MarkUsed(ctx context.Context, id string) (*PaymentLink, error) {
	var link PaymentLink
	if err := s.client.post(ctx, fmt.Sprintf("/internal/v1/payment-links/%s/mark-used", id), nil, &link); err != nil {
		return nil, mapPaymentLinkCoreError(err)
	}
	return &link, nil
}
