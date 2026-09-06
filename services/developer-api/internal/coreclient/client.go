// Package coreclient is the developer-api → Core internal boundary (ADR-047 /
// RT04B §3). Two things cross it, each with its own credential and neither
// borrowing the other's.
//
// Payee validation is the original one: before recording a Project→Merchant
// binding, Core is asked whether merchant→wallet→wallet_account is real, because
// Core is independently authoritative for that relationship and the operator
// provisioning path must never trust submitted Core identifiers.
//
// Refunds are the second, added when the Console gained its own refund. That one
// does move money, which is why it is a separate client with a separate key
// rather than a method on the first: the package no longer holds only read
// authority, and the boundary should say so instead of quietly widening.
package coreclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"
)

// ErrUnavailable means Core could not be reached or did not usably answer — the
// caller must fail closed (never record a binding on an unverified payee).
var ErrUnavailable = errors.New("core payee validation unavailable")

// Client calls Core's internal validate-payee endpoint.
type Client struct {
	baseURL     string
	internalKey string
	http        *http.Client
}

// New returns nil when unconfigured (base URL or internal key missing) so the
// caller can fail closed on binding.
func New(baseURL, internalKey string) *Client {
	if baseURL == "" || internalKey == "" {
		return nil
	}
	return &Client{
		baseURL:     baseURL,
		internalKey: internalKey,
		http:        &http.Client{Timeout: 5 * time.Second},
	}
}

// ValidatePayee asks Core whether merchant→wallet→wallet_account is a valid,
// active, sandbox payee. Returns (valid, reason). A transport/decode/non-200
// fault returns ErrUnavailable so the caller fails closed. No Core detail leaks.
func (c *Client) ValidatePayee(ctx context.Context, merchantID, walletID, walletAccountID string) (bool, string, error) {
	body, _ := json.Marshal(map[string]string{
		"merchant_id":       merchantID,
		"wallet_id":         walletID,
		"wallet_account_id": walletAccountID,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/internal/v1/wallet-accounts/validate-payee", bytes.NewReader(body))
	if err != nil {
		return false, "", ErrUnavailable
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", c.internalKey)
	resp, err := c.http.Do(req)
	if err != nil {
		return false, "", ErrUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false, "", ErrUnavailable // 401/403/5xx/malformed target → fail closed
	}
	var out struct {
		Valid  bool   `json:"valid"`
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return false, "", ErrUnavailable
	}
	return out.Valid, out.Reason, nil
}

// ── Refunds ──────────────────────────────────────────────────────────────────
//
// The Console's own refund. Until this, the package validated a payee and
// nothing else: it held no financial state and started no movement of money.
// A refund does move money, so the boundary is drawn explicitly rather than by
// reusing the payee credential.
//
// Core's refund group is the one `/internal` family that authenticates its
// caller, against CORE_INTERNAL_KEY. That is the same key the Gateway holds —
// there is one refund service credential, not one per caller — so this client
// takes it as its own field and is nil when it is not configured. A Console
// with no refund key reports the capability as unavailable instead of failing
// at the moment someone presses the button.
//
// Authority is settled before we get here: the caller is a workspace member with
// a role that may refund, the project's ACTIVE binding names the merchant, and
// the merchant is the one this client sends. Core re-checks independently that
// the source belongs to that merchant and is eligible, so a mistake on this side
// still meets a refusal on the other.

// RefundClient is the subset used for refunding. Nil when unconfigured.
type RefundClient struct {
	baseURL   string
	refundKey string
	http      *http.Client
}

// NewRefund returns nil when unconfigured, so the caller can present the
// capability as unavailable rather than discovering it at the point of use.
func NewRefund(baseURL, refundKey string) *RefundClient {
	if baseURL == "" || refundKey == "" {
		return nil
	}
	return &RefundClient{baseURL: baseURL, refundKey: refundKey, http: &http.Client{Timeout: 15 * time.Second}}
}

// PaymentSource is what Core says a payment can be refunded against: the typed
// source of BANZA ADR-017, plus the merchant that owns the payment so the caller
// can check it against the one its own authority chain produced.
type PaymentSource struct {
	MerchantID  string
	SourceType  string
	SourceID    string
	AmountMinor *int64
	Currency    string
	Status      string
}

// ErrNoRefundSource means the payment exists but nothing has been paid against
// it yet, so there is nothing to give back. Distinct from "not found" because
// they are different answers and lead to different words on screen.
var ErrNoRefundSource = errors.New("payment has no refundable source")

// PaymentSession reads a payment session and its refundable source. The read is
// unauthenticated at Core (only the refund group is gated), so ownership is NOT
// established by being able to read it — the caller must compare MerchantID
// against the merchant its own authority chain produced.
func (c *RefundClient) PaymentSession(ctx context.Context, id string) (*PaymentSource, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/internal/v1/payment-sessions/"+id, nil)
	if err != nil {
		return nil, ErrUnavailable
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrNotFound
	}
	if resp.StatusCode != http.StatusOK {
		return nil, ErrUnavailable
	}
	var out struct {
		MerchantID   string `json:"merchant_id"`
		AmountMinor  *int64 `json:"amount_minor"`
		Currency     string `json:"currency"`
		Status       string `json:"status"`
		RefundSource *struct {
			SourceType string `json:"source_type"`
			SourceID   string `json:"source_id"`
		} `json:"refund_source"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, ErrUnavailable
	}
	p := &PaymentSource{
		MerchantID:  out.MerchantID,
		AmountMinor: out.AmountMinor,
		Currency:    out.Currency,
		Status:      out.Status,
	}
	if out.RefundSource == nil || out.RefundSource.SourceID == "" {
		return p, ErrNoRefundSource
	}
	p.SourceType = out.RefundSource.SourceType
	p.SourceID = out.RefundSource.SourceID
	return p, nil
}

// ErrNotFound means Core has no such object.
var ErrNotFound = errors.New("not found")

// RefundRejected carries Core's own refusal — its code and message — so the
// reason a refund did not happen survives the trip instead of collapsing into
// "something went wrong". Core's vocabulary here is caller-facing by design
// (INSUFFICIENT_FUNDS, REFUND_CEILING_EXCEEDED, IDEMPOTENCY_KEY_CONFLICT).
type RefundRejected struct {
	Status  int
	Code    string
	Message string
}

func (e *RefundRejected) Error() string { return e.Code + ": " + e.Message }

// Refund is what Core created.
type Refund struct {
	ID          string `json:"id"`
	Status      string `json:"status"`
	AmountMinor int64  `json:"amount_minor"`
	Currency    string `json:"currency"`
	SourceType  string `json:"source_type"`
	SourceID    string `json:"source_id"`
}

// CreateRefund posts the refund. The idempotency key is the caller's and is
// never minted here: a financial write that quietly invents its own retry key
// turns a double-submit into two refunds.
func (c *RefundClient) CreateRefund(ctx context.Context, merchantID, sourceType, sourceID string,
	amountMinor int64, currency, reason, idempotencyKey string) (*Refund, error) {
	body, _ := json.Marshal(map[string]any{
		"source_type":     sourceType,
		"source_id":       sourceID,
		"merchant_id":     merchantID,
		"amount_minor":    amountMinor,
		"currency":        currency,
		"reason":          reason,
		"idempotency_key": idempotencyKey,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/v1/refunds", bytes.NewReader(body))
	if err != nil {
		return nil, ErrUnavailable
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", c.refundKey)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		var e struct {
			Error struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(raw, &e)
		code := e.Error.Code
		if code == "" {
			code = "REFUND_FAILED"
		}
		return nil, &RefundRejected{Status: resp.StatusCode, Code: code, Message: e.Error.Message}
	}
	var out Refund
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, ErrUnavailable
	}
	return &out, nil
}
