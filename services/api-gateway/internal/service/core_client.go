// Package service provides a CoreApiClient that delegates financial operations
// to the Rust core-api service over loopback HTTP (ADR-001).
package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// CoreApiClient is a thin HTTP client over the Rust core-api service.
// It implements the financial service interfaces used by the Go gateway handlers.
type CoreApiClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewCoreApiClient(baseURL string) *CoreApiClient {
	return &CoreApiClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// ---------------------------------------------------------------------------
// CoreApiTransactionService — implements TransactionService via the Rust core
// ---------------------------------------------------------------------------

type CoreApiTransactionService struct {
	client *CoreApiClient
}

func NewCoreApiTransactionService(client *CoreApiClient) *CoreApiTransactionService {
	return &CoreApiTransactionService{client: client}
}

func (s *CoreApiTransactionService) Create(
	ctx context.Context,
	req CreateTransactionRequest,
) (*Transaction, error) {
	body := map[string]any{
		"idempotency_key":  req.IdempotencyKey,
		"transaction_type": req.TransactionType,
		"amount_minor":     req.AmountMinor,
		"currency":         req.Currency,
		"merchant_id":      req.MerchantID,
		"wallet_id":        req.WalletID,
		"description":      req.Description,
	}

	var tx Transaction
	if err := s.client.post(ctx, "/internal/v1/transactions", body, &tx); err != nil {
		return nil, err
	}
	return &tx, nil
}

func (s *CoreApiTransactionService) Get(
	ctx context.Context,
	id string,
) (*Transaction, error) {
	var tx Transaction
	if err := s.client.get(ctx, "/internal/v1/transactions/"+id, &tx); err != nil {
		return nil, err
	}
	return &tx, nil
}

func (s *CoreApiTransactionService) List(
	ctx context.Context,
	req ListTransactionsRequest,
) (*TransactionPage, error) {
	// List is not yet exposed by the core-api; fall back to an empty page.
	// This will be implemented when the core-api gains a list endpoint.
	return &TransactionPage{Data: []*Transaction{}, HasMore: false}, nil
}

// ---------------------------------------------------------------------------
// CoreApiMerchantVerifier — wraps the Rust verify-key endpoint
// ---------------------------------------------------------------------------

// VerifyKeyViaCore verifies a raw API key against the Rust core-api.
// It is used by the auth middleware to authenticate incoming requests.
func VerifyKeyViaCore(ctx context.Context, client *CoreApiClient, rawKey string) (merchantID string, err error) {
	body := map[string]string{"raw_key": rawKey}

	var resp struct {
		MerchantID     string `json:"merchant_id"`
		MerchantName   string `json:"merchant_name"`
		MerchantStatus string `json:"merchant_status"`
	}

	if err := client.post(ctx, "/internal/v1/auth/verify-key", body, &resp); err != nil {
		return "", err
	}
	return resp.MerchantID, nil
}

// ---------------------------------------------------------------------------
// CoreApiPayoutService — implements PayoutService via the Rust core
// ---------------------------------------------------------------------------

type CoreApiPayoutService struct {
	client *CoreApiClient
}

func NewCoreApiPayoutService(client *CoreApiClient) *CoreApiPayoutService {
	return &CoreApiPayoutService{client: client}
}

func (s *CoreApiPayoutService) Create(
	ctx context.Context,
	req CreatePayoutRequest,
) (*Payout, error) {
	body := map[string]any{
		"idempotency_key":     req.IdempotencyKey,
		"merchant_id":         req.MerchantID,
		"wallet_id":           req.WalletID,
		"amount_minor":        req.AmountMinor,
		"currency":            req.Currency,
		"bank_account_number": req.BankAccountNumber,
		"bank_code":           req.BankCode,
		"account_holder_name": req.AccountHolderName,
	}
	var p Payout
	if err := s.client.post(ctx, "/internal/v1/payouts", body, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *CoreApiPayoutService) Get(
	ctx context.Context,
	_ string, // merchantID is validated by the core-api
	id string,
) (*Payout, error) {
	var p Payout
	if err := s.client.get(ctx, "/internal/v1/payouts/"+id, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *CoreApiPayoutService) List(
	ctx context.Context,
	merchantID string,
	limit int,
) ([]*Payout, error) {
	path := fmt.Sprintf("/internal/v1/payouts?merchant_id=%s&limit=%d", merchantID, limit)
	var result struct {
		Data []*Payout `json:"data"`
	}
	if err := s.client.get(ctx, path, &result); err != nil {
		return nil, err
	}
	return result.Data, nil
}

// ---------------------------------------------------------------------------
// Low-level HTTP helpers
// ---------------------------------------------------------------------------

func (c *CoreApiClient) post(ctx context.Context, path string, body any, out any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("core-api marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.baseURL+path,
		bytes.NewReader(data),
	)
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	return c.do(req, out)
}

func (c *CoreApiClient) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	return c.do(req, out)
}

func (c *CoreApiClient) do(req *http.Request, out any) error {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("core-api transport: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusNotFound {
		return ErrTransactionNotFound
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
