package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

var ErrAcquiringPaymentNotFound = errors.New("acquiring payment not found")
var ErrProviderError = errors.New("provider error")

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type PaymentInstructions struct {
	Method    string `json:"method"`
	Entity    string `json:"entity"`
	Reference string `json:"reference"`
}

type AcquiringPayment struct {
	ID            string              `json:"id"`
	PaymentLinkID string              `json:"payment_link_id"`
	Provider      string              `json:"provider"`
	ExternalRef   string              `json:"external_ref"`
	Status        string              `json:"status"`
	AmountMinor   int64               `json:"amount_minor"`
	Currency      string              `json:"currency"`
	Instructions  PaymentInstructions `json:"instructions"`
	ExpiresAt     string              `json:"expires_at"`
	CreatedAt     string              `json:"created_at"`
	ConfirmedAt   *string             `json:"confirmed_at"`
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

type AcquiringService interface {
	// InitiatePay creates a new acquiring payment for the given payment link
	// and returns the instructions the customer uses to complete payment.
	InitiatePay(ctx context.Context, paymentLinkID string, amountMinor int64, currency string) (*AcquiringPayment, error)

	// ProcessCallback forwards a raw provider callback to the Rust core for
	// HMAC validation and idempotent confirmation.
	ProcessCallback(ctx context.Context, rawBody []byte, signature string) (*AcquiringPayment, error)

	// TestConfirm generates and processes a signed test callback (simulated
	// provider only).  Returns ErrProviderError in production.
	TestConfirm(ctx context.Context, externalRef string, currency string) (*AcquiringPayment, error)
}

// ---------------------------------------------------------------------------
// CoreAPI implementation
// ---------------------------------------------------------------------------

type CoreApiAcquiringService struct {
	client *CoreApiClient
}

func NewCoreApiAcquiringService(client *CoreApiClient) *CoreApiAcquiringService {
	return &CoreApiAcquiringService{client: client}
}

func (s *CoreApiAcquiringService) InitiatePay(
	ctx context.Context,
	paymentLinkID string,
	amountMinor int64,
	currency string,
) (*AcquiringPayment, error) {
	body := map[string]any{
		"payment_link_id": paymentLinkID,
		"amount_minor":    amountMinor,
		"currency":        currency,
	}
	var payment AcquiringPayment
	if err := s.client.post(ctx, "/internal/v1/acquiring/payments", body, &payment); err != nil {
		return nil, err
	}
	return &payment, nil
}

// ProcessCallback forwards the raw provider callback bytes and HMAC signature
// to the Rust core-api, which validates and processes them.
func (s *CoreApiAcquiringService) ProcessCallback(
	ctx context.Context,
	rawBody []byte,
	signature string,
) (*AcquiringPayment, error) {
	reqURL := s.client.baseURL + "/internal/v1/acquiring/callbacks/emis"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, bytes.NewReader(rawBody))
	if err != nil {
		return nil, fmt.Errorf("build callback request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if signature != "" {
		req.Header.Set("Banza-Signature", signature)
	}

	resp, err := s.client.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("callback request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("%w: core-api %d: %s", ErrProviderError, resp.StatusCode, body)
	}

	var payment AcquiringPayment
	if err := json.NewDecoder(resp.Body).Decode(&payment); err != nil {
		return nil, fmt.Errorf("decode callback response: %w", err)
	}
	return &payment, nil
}

func (s *CoreApiAcquiringService) TestConfirm(
	ctx context.Context,
	externalRef string,
	currency string,
) (*AcquiringPayment, error) {
	if currency == "" {
		currency = "AOA"
	}
	path := fmt.Sprintf(
		"/internal/v1/acquiring/test/confirm?external_ref=%s&currency=%s",
		url.QueryEscape(externalRef),
		url.QueryEscape(currency),
	)
	var payment AcquiringPayment
	if err := s.client.post(ctx, path, nil, &payment); err != nil {
		return nil, err
	}
	return &payment, nil
}
