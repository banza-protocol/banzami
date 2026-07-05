// Package coreclient is the developer-api → Core internal boundary (ADR-047 /
// RT04B §3). It is used ONLY to validate a payee relationship before recording a
// Project→Merchant binding — Core is independently authoritative for the
// merchant→wallet→wallet_account relationship, so the operator provisioning path
// never trusts arbitrary submitted Core identifiers. The client holds no
// financial state and initiates no settlement.
package coreclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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
