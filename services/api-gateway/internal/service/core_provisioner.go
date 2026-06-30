package service

import (
	"context"
	"fmt"
)

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
	if err := c.post(ctx, "/internal/v1/merchants/"+merchantID+"/api-keys",
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
	return c.post(ctx, "/internal/v1/compliance/merchants/"+merchantID+"/approve", nil, &out)
}
