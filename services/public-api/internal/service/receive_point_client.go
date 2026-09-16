package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"time"

	"github.com/banzami/banzami/services/common/obs"
)

// ReceivePointClient reaches the Business Receive Point (ADR-065) over the gateway's
// service-credential surface. The gateway owns the operator-local receive-point
// tables and the idempotent mint; public-api holds the consumer session and hands
// the gateway the authenticated payer. Resolution goes through the internal surface
// too, so public-api's single IP never contends for the public route's per-IP limit.
type ReceivePointClient struct {
	baseURL     string
	internalKey string
	http        *http.Client
}

// NewReceivePointClient returns nil when the gateway internal URL/key are absent;
// the handler then answers RECEIVE_POINT_UNAVAILABLE rather than guess a payee.
func NewReceivePointClient(baseURL, internalKey string) *ReceivePointClient {
	if baseURL == "" || internalKey == "" {
		return nil
	}
	return &ReceivePointClient{
		baseURL:     baseURL,
		internalKey: internalKey,
		http:        &http.Client{Timeout: 8 * time.Second, Transport: obs.NewPropagationTransport(nil)},
	}
}

// ReceivePointResolved is the payer-safe Business identity behind a scanned slug.
// No wallet/owner/binding/internal id.
type ReceivePointResolved struct {
	Slug        string `json:"slug"`
	DisplayName string `json:"display_name"`
	Handle      string `json:"handle"`
	Currency    string `json:"currency"`
	Status      string `json:"status"`
	Environment string `json:"environment"`
}

// MintedSession is what the payer needs to complete payment: the fresh session and
// its hosted pay interface.
type MintedSession struct {
	SessionID       string  `json:"session_id"`
	AmountMinor     *int64  `json:"amount_minor"`
	Currency        string  `json:"currency"`
	Status          string  `json:"status"`
	ExpiresAt       *string `json:"expires_at"`
	PayURL          string  `json:"pay_url"`
	PaymentLinkSlug string  `json:"payment_link_slug"`
}

// Typed outcomes so the handler can map the contract statuses without re-parsing.
var (
	ErrReceivePointNotFound    = errors.New("receive point not found")
	ErrReceivePointDisabled    = errors.New("receive point disabled")
	ErrReceivePointIneligible  = errors.New("business cannot receive")
	ErrReceivePointMintKey     = errors.New("idempotency key invalid")
	ErrReceivePointConflict    = errors.New("idempotency key reused for a different payment")
	ErrReceivePointPending     = errors.New("mint in progress, retry")
	ErrReceivePointUnavailable = errors.New("receive point unavailable")
)

// Resolve reads the payer-safe identity behind a slug.
func (c *ReceivePointClient) Resolve(ctx context.Context, slug string) (*ReceivePointResolved, error) {
	if c == nil {
		return nil, ErrReceivePointUnavailable
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+"/internal/v1/receive-points/"+url.PathEscape(slug), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Internal-Key", c.internalKey)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, mapReceivePointError(resp)
	}
	var out ReceivePointResolved
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Mint asks the gateway to mint a FRESH Payment Session for this payer. The payee
// is server-resolved from the slug; the caller never names it.
func (c *ReceivePointClient) Mint(ctx context.Context, slug, payerID string, amountMinor int64, idempotencyKey string) (*MintedSession, error) {
	if c == nil {
		return nil, ErrReceivePointUnavailable
	}
	body, _ := json.Marshal(map[string]any{
		"payer_id":        payerID,
		"amount_minor":    amountMinor,
		"idempotency_key": idempotencyKey,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/internal/v1/receive-points/"+url.PathEscape(slug)+"/sessions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", c.internalKey)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return nil, mapReceivePointError(resp)
	}
	var out MintedSession
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

// mapReceivePointError turns the gateway's typed error body into a typed outcome.
// It keys on the stable error code, falling back to the status class.
func mapReceivePointError(resp *http.Response) error {
	var e struct {
		Code string `json:"code"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&e)
	switch e.Code {
	case "RECEIVE_POINT_NOT_FOUND":
		return ErrReceivePointNotFound
	case "RECEIVE_POINT_DISABLED":
		return ErrReceivePointDisabled
	case "BUSINESS_CANNOT_RECEIVE":
		return ErrReceivePointIneligible
	case "IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_KEY_TOO_LONG":
		return ErrReceivePointMintKey
	case "IDEMPOTENCY_KEY_REUSED":
		return ErrReceivePointConflict
	case "MINT_IN_PROGRESS":
		return ErrReceivePointPending
	}
	switch resp.StatusCode {
	case http.StatusNotFound:
		return ErrReceivePointNotFound
	case http.StatusConflict:
		return ErrReceivePointConflict
	case http.StatusUnprocessableEntity:
		return ErrReceivePointIneligible
	default:
		return ErrReceivePointUnavailable
	}
}
