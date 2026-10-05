package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
)

// ErrBusinessDeletionPendingSettlement is returned when a Business cannot be
// deleted yet because a settlement is still in flight (core refuses the retire
// with 409 PENDING_SETTLEMENT). The caller surfaces a "try again shortly" error.
var ErrBusinessDeletionPendingSettlement = errors.New("a settlement is still in flight")

// Core provisioning calls used by the merchant-application approval flow. These
// hit the same core-api internal endpoints the admin-api uses for manual
// merchant creation, so approval reuses the audited core merchant/wallet/api-key
// and compliance logic rather than duplicating it.

func strField(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// CreateMerchant creates a merchant and returns its id. ADR-028: the declared
// business account type is carried through from the approved application (empty ⇒
// core defaults to MERCHANT).
func (c *CoreApiClient) CreateMerchant(ctx context.Context, name, email, businessAccountType string) (string, error) {
	var out map[string]any
	body := map[string]string{"name": name, "email": email}
	if businessAccountType != "" {
		body["business_account_type"] = businessAccountType
	}
	if err := c.post(ctx, "/internal/v1/merchants", body, &out); err != nil {
		return "", err
	}
	id := strField(out, "id")
	if id == "" {
		return "", fmt.Errorf("core-api: merchant create returned no id")
	}
	return id, nil
}

// CreateWallet creates a merchant wallet and returns its id.
func (c *CoreApiClient) CreateWallet(ctx context.Context, merchantID, currency string) (string, error) {
	var out map[string]any
	if err := c.post(ctx, "/internal/v1/wallets",
		map[string]string{"merchant_id": merchantID, "currency": currency}, &out); err != nil {
		return "", err
	}
	return strField(out, "id"), nil
}

// CreateApiKey creates an API key and returns its non-secret prefix (the raw
// secret is intentionally discarded here — the activation flow, not the API key,
// is the primary login).
func (c *CoreApiClient) CreateApiKey(ctx context.Context, merchantID, name, environment string) (string, error) {
	var out map[string]any
	if err := c.post(ctx, "/internal/v1/merchants/"+url.PathEscape(merchantID)+"/api-keys",
		map[string]string{"name": name, "environment": environment}, &out); err != nil {
		return "", err
	}
	// Core returns ApiKeySecret { key: { key_prefix, ... }, secret }. The raw
	// secret is intentionally discarded; only the non-secret prefix is kept.
	if key, ok := out["key"].(map[string]any); ok {
		return strField(key, "key_prefix"), nil
	}
	return strField(out, "key_prefix"), nil
}

// ApproveCompliance approves the merchant's KYB/AML so it can transact. The
// application approval IS the KYB decision.
func (c *CoreApiClient) ApproveCompliance(ctx context.Context, merchantID string) error {
	var out map[string]any
	return c.post(ctx, "/internal/v1/compliance/merchants/"+url.PathEscape(merchantID)+"/approve", nil, &out)
}

// AssignPricingProfile records which operator-governed pricing profile prices a
// merchant. An assignment, not a creation: repeating it is harmless, so a
// resumed approval can call it on every attempt.
func (c *CoreApiClient) AssignPricingProfile(ctx context.Context, merchantID, profileCode string) error {
	status, raw, err := c.requestRaw(ctx, "PUT", "/internal/v1/merchants/"+url.PathEscape(merchantID)+"/pricing-profile",
		map[string]string{"profile_code": profileCode})
	if err != nil {
		return err
	}
	if status >= 300 {
		return fmt.Errorf("core-api: assign pricing profile: %d %.160s", status, string(raw))
	}
	return nil
}

// DeleteConsumer executes the ledger-safe Consumer account deletion in core:
// sweep any fictitious Sandbox balance, close the consumer to a tombstone, scrub
// the display name, retire the @banza handle and drop known devices. Core is
// idempotent (a replay returns the first result) and Sandbox-guarded. The id is
// resolved by the operator flow from the request's handle, never client-supplied.
func (c *CoreApiClient) DeleteConsumer(ctx context.Context, consumerID string) error {
	status, raw, err := c.requestRaw(ctx, "POST",
		"/internal/v1/consumers/"+url.PathEscape(consumerID)+"/delete", nil)
	if err != nil {
		return err
	}
	if status >= 300 {
		return fmt.Errorf("core-api: delete consumer: %d %.160s", status, string(raw))
	}
	return nil
}

// DeleteBusiness executes the ledger-safe Business account deletion in core:
// retire (refuses while a settlement is in flight), close the merchant to a
// tombstone, revoke API keys, retire the @banza handle and scrub the public
// profile. Core is idempotent (a replay returns the first result). The id comes
// from the authenticated session, never the client.
func (c *CoreApiClient) DeleteBusiness(ctx context.Context, merchantID string) error {
	status, raw, err := c.requestRaw(ctx, "POST",
		"/internal/v1/merchants/"+url.PathEscape(merchantID)+"/delete", nil)
	if err != nil {
		return err
	}
	if status == http.StatusConflict {
		return ErrBusinessDeletionPendingSettlement
	}
	if status >= 300 {
		return fmt.Errorf("core-api: delete business: %d %.160s", status, string(raw))
	}
	return nil
}
