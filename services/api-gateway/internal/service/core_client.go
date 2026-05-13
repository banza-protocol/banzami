// Package service provides a CoreApiClient that delegates financial operations
// to the Rust core-api service over loopback HTTP (ADR-001).
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

// ErrNotFound is returned by CoreApi* services when the resource does not exist.
var ErrNotFound = errors.New("resource not found")

// CoreApiClient is a thin HTTP client over the Rust core-api service.
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
	_ string, // merchantID validated in the handler
	id string,
) (*Transaction, error) {
	var tx Transaction
	if err := s.client.get(ctx, "/internal/v1/transactions/"+id, &tx); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrTransactionNotFound
		}
		return nil, err
	}
	return &tx, nil
}

func (s *CoreApiTransactionService) List(
	ctx context.Context,
	req ListTransactionsRequest,
) (*TransactionPage, error) {
	// Transaction listing not yet exposed by core-api. Return empty page.
	return &TransactionPage{Data: []*Transaction{}, HasMore: false}, nil
}

// ---------------------------------------------------------------------------
// CoreApiWalletService — implements WalletService via the Rust core
// ---------------------------------------------------------------------------

type CoreApiWalletService struct {
	client *CoreApiClient
}

func NewCoreApiWalletService(client *CoreApiClient) *CoreApiWalletService {
	return &CoreApiWalletService{client: client}
}

// coreWalletResp matches the Rust Wallet struct serialization.
type coreWalletResp struct {
	ID                 string    `json:"id"`
	MerchantID         string    `json:"merchant_id"`
	Currency           string    `json:"currency"`
	Status             string    `json:"status"`
	AvailableAccountID string    `json:"available_account_id"`
	ReservedAccountID  string    `json:"reserved_account_id"`
	CreatedAt          time.Time `json:"created_at"`
}

func (r *coreWalletResp) toWalletRecord() *WalletRecord {
	return &WalletRecord{
		ID:         r.ID,
		MerchantID: r.MerchantID,
		Currency:   r.Currency,
		Status:     r.Status,
		CreatedAt:  r.CreatedAt,
	}
}

// coreMoneyResp matches the Rust Money struct serialization.
type coreMoneyResp struct {
	AmountMinor int64  `json:"amount_minor"`
	Currency    string `json:"currency"`
}

// coreWalletBalanceResp matches the Rust WalletBalance struct serialization.
type coreWalletBalanceResp struct {
	WalletID   string        `json:"wallet_id"`
	Currency   string        `json:"currency"`
	Available  coreMoneyResp `json:"available"`
	Reserved   coreMoneyResp `json:"reserved"`
	Total      coreMoneyResp `json:"total"`
	ComputedAt time.Time     `json:"computed_at"`
}

func (s *CoreApiWalletService) Create(ctx context.Context, merchantID, currency string) (*WalletRecord, error) {
	body := map[string]string{
		"merchant_id": merchantID,
		"currency":    currency,
	}
	var resp coreWalletResp
	if err := s.client.post(ctx, "/internal/v1/wallets", body, &resp); err != nil {
		return nil, err
	}
	return resp.toWalletRecord(), nil
}

func (s *CoreApiWalletService) Get(ctx context.Context, id string) (*WalletRecord, error) {
	var resp coreWalletResp
	if err := s.client.get(ctx, "/internal/v1/wallets/"+id, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrWalletNotFound
		}
		return nil, err
	}
	return resp.toWalletRecord(), nil
}

func (s *CoreApiWalletService) Balance(ctx context.Context, id string) (*WalletBalance, error) {
	var resp coreWalletBalanceResp
	if err := s.client.get(ctx, "/internal/v1/wallets/"+id+"/balance", &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrWalletNotFound
		}
		return nil, err
	}
	return &WalletBalance{
		WalletID:       resp.WalletID,
		Currency:       resp.Currency,
		AvailableMinor: resp.Available.AmountMinor,
		ReservedMinor:  resp.Reserved.AmountMinor,
		TotalMinor:     resp.Total.AmountMinor,
		ComputedAt:     resp.ComputedAt,
	}, nil
}

func (s *CoreApiWalletService) GetForMerchant(ctx context.Context, merchantID, currency string) (*WalletRecord, error) {
	path := fmt.Sprintf("/internal/v1/wallets?merchant_id=%s&currency=%s", merchantID, currency)
	var resp coreWalletResp
	if err := s.client.get(ctx, path, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrWalletNotFound
		}
		return nil, err
	}
	return resp.toWalletRecord(), nil
}

// ---------------------------------------------------------------------------
// CoreApiMerchantService — implements MerchantService via the Rust core
// ---------------------------------------------------------------------------

type CoreApiMerchantService struct {
	client *CoreApiClient
}

func NewCoreApiMerchantService(client *CoreApiClient) *CoreApiMerchantService {
	return &CoreApiMerchantService{client: client}
}

// coreMerchantResp matches the Rust Merchant struct serialization.
type coreMerchantResp struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (r *coreMerchantResp) toMerchantRecord() *MerchantRecord {
	return &MerchantRecord{
		ID:        r.ID,
		Name:      r.Name,
		Email:     r.Email,
		Status:    MerchantStatus(r.Status),
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.UpdatedAt,
	}
}

// coreApiKeyResp matches the Rust ApiKey struct serialization.
type coreApiKeyResp struct {
	ID         string     `json:"id"`
	MerchantID string     `json:"merchant_id"`
	Name       string     `json:"name"`
	KeyPrefix  string     `json:"key_prefix"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at"`
	RevokedAt  *time.Time `json:"revoked_at"`
}

func (r *coreApiKeyResp) toApiKeyRecord() *ApiKeyRecord {
	return &ApiKeyRecord{
		ID:         r.ID,
		MerchantID: r.MerchantID,
		Name:       r.Name,
		KeyPrefix:  r.KeyPrefix,
		CreatedAt:  r.CreatedAt,
		LastUsedAt: r.LastUsedAt,
		RevokedAt:  r.RevokedAt,
	}
}

func (s *CoreApiMerchantService) Create(ctx context.Context, req CreateMerchantRequest) (*MerchantRecord, error) {
	body := map[string]string{"name": req.Name, "email": req.Email}
	var resp coreMerchantResp
	if err := s.client.post(ctx, "/internal/v1/merchants", body, &resp); err != nil {
		return nil, err
	}
	return resp.toMerchantRecord(), nil
}

func (s *CoreApiMerchantService) Get(ctx context.Context, id string) (*MerchantRecord, error) {
	var resp coreMerchantResp
	if err := s.client.get(ctx, "/internal/v1/merchants/"+id, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrMerchantNotFound
		}
		return nil, err
	}
	return resp.toMerchantRecord(), nil
}

func (s *CoreApiMerchantService) Suspend(ctx context.Context, id string) (*MerchantRecord, error) {
	var resp coreMerchantResp
	if err := s.client.post(ctx, "/internal/v1/merchants/"+id+"/suspend", nil, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrMerchantNotFound
		}
		return nil, err
	}
	return resp.toMerchantRecord(), nil
}

func (s *CoreApiMerchantService) CreateApiKey(ctx context.Context, merchantID, name string) (*ApiKeyWithSecret, error) {
	body := map[string]string{"name": name}
	var resp struct {
		Key    coreApiKeyResp `json:"key"`
		Secret string         `json:"secret"`
	}
	if err := s.client.post(ctx, "/internal/v1/merchants/"+merchantID+"/api-keys", body, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrMerchantNotFound
		}
		return nil, err
	}
	return &ApiKeyWithSecret{
		ApiKeyRecord: *resp.Key.toApiKeyRecord(),
		Secret:       resp.Secret,
	}, nil
}

func (s *CoreApiMerchantService) ListApiKeys(ctx context.Context, merchantID string) ([]*ApiKeyRecord, error) {
	var raw []coreApiKeyResp
	if err := s.client.get(ctx, "/internal/v1/merchants/"+merchantID+"/api-keys", &raw); err != nil {
		return nil, err
	}
	keys := make([]*ApiKeyRecord, len(raw))
	for i, r := range raw {
		r := r
		keys[i] = r.toApiKeyRecord()
	}
	return keys, nil
}

func (s *CoreApiMerchantService) RevokeApiKey(ctx context.Context, merchantID, keyID string) error {
	path := fmt.Sprintf("/internal/v1/merchants/%s/api-keys/%s", merchantID, keyID)
	if err := s.client.delete(ctx, path); err != nil {
		if errors.Is(err, ErrNotFound) {
			return ErrApiKeyNotFound
		}
		return err
	}
	return nil
}

func (s *CoreApiMerchantService) VerifyApiKey(ctx context.Context, rawKey string) (*MerchantRecord, error) {
	body := map[string]string{"raw_key": rawKey}
	var resp struct {
		MerchantID     string `json:"merchant_id"`
		MerchantName   string `json:"merchant_name"`
		MerchantStatus string `json:"merchant_status"`
	}
	if err := s.client.post(ctx, "/internal/v1/auth/verify-key", body, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrInvalidApiKey
		}
		return nil, ErrInvalidApiKey
	}
	return &MerchantRecord{
		ID:     resp.MerchantID,
		Name:   resp.MerchantName,
		Status: MerchantStatus(resp.MerchantStatus),
	}, nil
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
	_ string,
	id string,
) (*Payout, error) {
	var p Payout
	if err := s.client.get(ctx, "/internal/v1/payouts/"+id, &p); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrPayoutNotFound
		}
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

func (c *CoreApiClient) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	return c.do(req, out)
}

func (c *CoreApiClient) delete(ctx context.Context, path string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	return c.do(req, nil)
}

func (c *CoreApiClient) do(req *http.Request, out any) error {
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

	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("core-api decode: %w", err)
		}
	}
	return nil
}
