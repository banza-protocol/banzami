package service

import (
	"context"
	"errors"
	"net/url"
	"strconv"
)

// PaymentSession is the SAFE, app-facing view of a Payment Session (ADR-043): the
// session id, its destination wallet_account (an app-facing id, never a ledger
// account id), and the interface artifacts (link slug + QR payload). The gateway
// builds the public link URL + deep link from these. No internal ledger id leaks.
type PaymentSession struct {
	SessionID        string  `json:"session_id"`
	MerchantID       string  `json:"merchant_id"`
	WalletID         string  `json:"wallet_id"`
	WalletAccountID  string  `json:"wallet_account_id"`
	Currency         string  `json:"currency"`
	AmountMinor      *int64  `json:"amount_minor"`
	Purpose          string  `json:"purpose"`
	ReferenceType    *string `json:"reference_type"`
	ReferenceID      *string `json:"reference_id"`
	Status           string  `json:"status"`
	PaymentLinkSlug  *string `json:"payment_link_slug"`
	QrCodeID         *string `json:"qr_code_id"`
	QrPayload        *string `json:"qr_payload"`
	ExpiresAt        *string `json:"expires_at"`
	CreatedAt        string  `json:"created_at"`
}

type CreatePaymentSessionInput struct {
	MerchantID      string
	WalletAccountID string
	Purpose         string
	ReferenceType   string
	ReferenceID     string
	AmountMinor     *int64
	Currency        string
	Description     string
	ExpiresAt       *string
	Metadata        map[string]any
}

type PaymentSessionService interface {
	Create(ctx context.Context, in CreatePaymentSessionInput) (*PaymentSession, error)
	Get(ctx context.Context, id string) (*PaymentSession, error)
	// List returns a merchant's sessions, newest first (optional status filter).
	List(ctx context.Context, merchantID, status string, limit int) ([]PaymentSession, error)
	// GetByInterface resolves the session owning a payment link or QR (kind =
	// "link"|"qr"), for webhook enrichment. Returns nil when there is no session.
	GetByInterface(ctx context.Context, kind, refID string) (*PaymentSession, error)
}

type CoreApiPaymentSessionService struct{ client *CoreApiClient }

func NewCoreApiPaymentSessionService(c *CoreApiClient) *CoreApiPaymentSessionService {
	return &CoreApiPaymentSessionService{client: c}
}

func (s *CoreApiPaymentSessionService) Create(ctx context.Context, in CreatePaymentSessionInput) (*PaymentSession, error) {
	body := map[string]any{
		"merchant_id":       in.MerchantID,
		"wallet_account_id": in.WalletAccountID,
		"purpose":           in.Purpose,
	}
	if in.ReferenceType != "" {
		body["reference_type"] = in.ReferenceType
	}
	if in.ReferenceID != "" {
		body["reference_id"] = in.ReferenceID
	}
	if in.AmountMinor != nil {
		body["amount_minor"] = *in.AmountMinor
	}
	if in.Currency != "" {
		body["currency"] = in.Currency
	}
	if in.Description != "" {
		body["description"] = in.Description
	}
	if in.ExpiresAt != nil {
		body["expires_at"] = *in.ExpiresAt
	}
	if in.Metadata != nil {
		body["metadata"] = in.Metadata
	}
	var sess PaymentSession
	if err := s.client.post(ctx, "/internal/v1/payment-sessions", body, &sess); err != nil {
		return nil, err
	}
	return &sess, nil
}

func (s *CoreApiPaymentSessionService) Get(ctx context.Context, id string) (*PaymentSession, error) {
	var sess PaymentSession
	if err := s.client.get(ctx, "/internal/v1/payment-sessions/"+id, &sess); err != nil {
		return nil, err
	}
	return &sess, nil
}

func (s *CoreApiPaymentSessionService) List(ctx context.Context, merchantID, status string, limit int) ([]PaymentSession, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q := url.Values{}
	q.Set("merchant_id", merchantID)
	q.Set("limit", strconv.Itoa(limit))
	if status != "" {
		q.Set("status", status)
	}
	var resp struct {
		Data []PaymentSession `json:"data"`
	}
	if err := s.client.get(ctx, "/internal/v1/payment-sessions?"+q.Encode(), &resp); err != nil {
		return nil, err
	}
	return resp.Data, nil
}

func (s *CoreApiPaymentSessionService) GetByInterface(ctx context.Context, kind, refID string) (*PaymentSession, error) {
	var sess PaymentSession
	if err := s.client.get(ctx, "/internal/v1/payment-sessions/by-interface/"+kind+"/"+refID, &sess); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &sess, nil
}
