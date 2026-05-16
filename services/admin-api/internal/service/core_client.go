// Package service provides a CoreAdminClient for calling the Rust core-api
// from the admin-api service. All financial operations are delegated to the
// Rust core — the admin service orchestrates but never writes financial data directly.
package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// CoreAdminClient is a thin HTTP client wrapping the Rust core-api.
type CoreAdminClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewCoreAdminClient(baseURL string) *CoreAdminClient {
	return &CoreAdminClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) GetMerchantCompliance(ctx context.Context, merchantID string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/compliance/merchants/"+merchantID, &out)
}

func (c *CoreAdminClient) ApproveMerchant(ctx context.Context, merchantID string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/compliance/merchants/"+merchantID+"/approve", nil, &out)
}

func (c *CoreAdminClient) RejectMerchant(ctx context.Context, merchantID, notes string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/compliance/merchants/"+merchantID+"/reject",
		map[string]string{"notes": notes}, &out)
}

func (c *CoreAdminClient) SuspendMerchant(ctx context.Context, merchantID, notes string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/compliance/merchants/"+merchantID+"/suspend",
		map[string]string{"notes": notes}, &out)
}

func (c *CoreAdminClient) FlagMerchantAML(ctx context.Context, merchantID, notes string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/compliance/merchants/"+merchantID+"/flag-aml",
		map[string]string{"notes": notes}, &out)
}

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) CreateSettlementBatch(ctx context.Context, body map[string]any) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/settlements", body, &out)
}

func (c *CoreAdminClient) GetSettlement(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/settlements/"+id, &out)
}

func (c *CoreAdminClient) ListSettlements(ctx context.Context, merchantID string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/settlements?merchant_id="+merchantID, &out)
}

func (c *CoreAdminClient) ListAllSettlements(ctx context.Context, status string) (map[string]any, error) {
	var out map[string]any
	url := "/internal/v1/settlements/all"
	if status != "" {
		url += "?status=" + status
	}
	return out, c.get(ctx, url, &out)
}

func (c *CoreAdminClient) SubmitSettlement(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/settlements/"+id+"/submit", nil, &out)
}

func (c *CoreAdminClient) ConfirmSettlement(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/settlements/"+id+"/confirm", nil, &out)
}

func (c *CoreAdminClient) FailSettlement(ctx context.Context, id, reason string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/settlements/"+id+"/fail",
		map[string]string{"reason": reason}, &out)
}

// ---------------------------------------------------------------------------
// Payouts (admin-side lifecycle management)
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) GetPayout(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/payouts/"+id, &out)
}

func (c *CoreAdminClient) ListPayouts(ctx context.Context, merchantID string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/payouts?merchant_id="+merchantID, &out)
}

func (c *CoreAdminClient) ListAllPayouts(ctx context.Context, status string) (map[string]any, error) {
	var out map[string]any
	url := "/internal/v1/payouts/all"
	if status != "" {
		url += "?status=" + status
	}
	return out, c.get(ctx, url, &out)
}

func (c *CoreAdminClient) ProcessPayout(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/payouts/"+id+"/process", nil, &out)
}

func (c *CoreAdminClient) MarkPayoutSent(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/payouts/"+id+"/sent", nil, &out)
}

func (c *CoreAdminClient) ConfirmPayout(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/payouts/"+id+"/confirm", nil, &out)
}

func (c *CoreAdminClient) FailPayout(ctx context.Context, id, reason string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/payouts/"+id+"/fail",
		map[string]string{"reason": reason}, &out)
}

func (c *CoreAdminClient) MarkPayoutReturned(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/payouts/"+id+"/returned", nil, &out)
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) RunReconciliation(ctx context.Context, body map[string]any) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/reconciliation/run", body, &out)
}

func (c *CoreAdminClient) GetReconciliationRun(ctx context.Context, runID string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/reconciliation/runs/"+runID, &out)
}

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) ListMerchants(ctx context.Context, search string) ([]map[string]any, error) {
	path := "/internal/v1/merchants"
	if search != "" {
		path += "?search=" + search
	}
	var out []map[string]any
	return out, c.get(ctx, path, &out)
}

func (c *CoreAdminClient) GetMerchant(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/merchants/"+id, &out)
}

func (c *CoreAdminClient) CreateMerchant(ctx context.Context, name, email string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/merchants",
		map[string]string{"name": name, "email": email}, &out)
}

func (c *CoreAdminClient) CreateApiKey(ctx context.Context, merchantID, keyName string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/merchants/"+merchantID+"/api-keys",
		map[string]string{"name": keyName}, &out)
}

func (c *CoreAdminClient) CreateWallet(ctx context.Context, merchantID, currency string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/wallets",
		map[string]string{"merchant_id": merchantID, "currency": currency}, &out)
}

func (c *CoreAdminClient) GetWallet(ctx context.Context, merchantID, currency string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/wallets?merchant_id="+merchantID+"&currency="+currency, &out)
}

func (c *CoreAdminClient) CreateTransaction(ctx context.Context, body map[string]any) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/transactions", body, &out)
}

func (c *CoreAdminClient) AuthorizeTransaction(ctx context.Context, txID string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/transactions/"+txID+"/authorize", nil, &out)
}

func (c *CoreAdminClient) CaptureTransaction(ctx context.Context, txID string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/transactions/"+txID+"/capture", nil, &out)
}

// ---------------------------------------------------------------------------
// Consumers
// ---------------------------------------------------------------------------

func (c *CoreAdminClient) ListConsumers(ctx context.Context, handle string) (map[string]any, error) {
	path := "/internal/v1/consumers"
	if handle != "" {
		path += "?handle=" + handle
	}
	var out map[string]any
	return out, c.get(ctx, path, &out)
}

func (c *CoreAdminClient) GetConsumer(ctx context.Context, id string) (map[string]any, error) {
	var out map[string]any
	return out, c.get(ctx, "/internal/v1/consumers/"+id, &out)
}

func (c *CoreAdminClient) TestCreditConsumer(ctx context.Context, consumerID string, amountMinor int64, currency string) (map[string]any, error) {
	var out map[string]any
	return out, c.post(ctx, "/internal/v1/consumer-wallets/test-credit",
		map[string]any{"consumer_id": consumerID, "amount_minor": amountMinor, "currency": currency}, &out)
}

// ---------------------------------------------------------------------------
// Low-level HTTP helpers
// ---------------------------------------------------------------------------

var ErrNotFound = errors.New("not found")

func (c *CoreAdminClient) post(ctx context.Context, path string, body any, out any) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("core-api marshal: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.do(req, out)
}

func (c *CoreAdminClient) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	return c.do(req, out)
}

func (c *CoreAdminClient) do(req *http.Request, out any) error {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("core-api transport: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("core-api error %d: %s", resp.StatusCode, string(raw))
	}

	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("core-api decode: %w", err)
		}
	}
	return nil
}
