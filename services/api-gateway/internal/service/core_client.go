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
	"strings"
	"time"
)

// ErrNotFound is returned by CoreApi* services when the resource does not exist.
var ErrNotFound = errors.New("resource not found")

// coreErrBody is the standard error envelope returned by the Rust core-api.
type coreErrBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

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

// coreTransactionResp mirrors the Rust Transaction JSON, where monetary values
// are nested Money objects rather than flat fields.
type coreTransactionResp struct {
	ID              string        `json:"id"`
	IdempotencyKey  string        `json:"idempotency_key"`
	TransactionType string        `json:"transaction_type"`
	Status          string        `json:"status"`
	Amount          coreMoneyResp `json:"amount"`
	Currency        string        `json:"currency"`
	MerchantID      string        `json:"merchant_id"`
	WalletID        string        `json:"wallet_id"`
	Description     *string       `json:"description"`
	FailureReason   *string       `json:"failure_reason"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`
}

func (r *coreTransactionResp) toTransaction() *Transaction {
	desc := ""
	if r.Description != nil {
		desc = *r.Description
	}
	return &Transaction{
		ID:             r.ID,
		Status:         r.Status,
		AmountMinor:    r.Amount.AmountMinor,
		Currency:       r.Amount.Currency,
		MerchantID:     r.MerchantID,
		IdempotencyKey: r.IdempotencyKey,
		Description:    desc,
		Environment:    "LIVE", // CoreApi always operates on live data
		CreatedAt:      r.CreatedAt,
	}
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

	var resp coreTransactionResp
	if err := s.client.post(ctx, "/internal/v1/transactions", body, &resp); err != nil {
		return nil, err
	}
	return resp.toTransaction(), nil
}

func (s *CoreApiTransactionService) Get(
	ctx context.Context,
	_ string, // merchantID validated in the handler
	id string,
	_ string, // environment enforced by the core via JWT — passed for interface compatibility
) (*Transaction, error) {
	var resp coreTransactionResp
	if err := s.client.get(ctx, "/internal/v1/transactions/"+id, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrTransactionNotFound
		}
		return nil, err
	}
	return resp.toTransaction(), nil
}

func (s *CoreApiTransactionService) List(
	ctx context.Context,
	req ListTransactionsRequest,
) (*TransactionPage, error) {
	limit := req.Limit
	if limit <= 0 {
		limit = 20
	}

	path := fmt.Sprintf("/internal/v1/transactions?merchant_id=%s&limit=%d",
		req.MerchantID, limit)

	if req.Since != nil {
		path += "&since_created_at=" + req.Since.UTC().Format(time.RFC3339)
	}

	if req.Cursor != "" {
		ts, id, err := decodeCursor(req.Cursor)
		if err == nil {
			path += fmt.Sprintf("&before_created_at=%s&before_id=%s",
				ts.UTC().Format(time.RFC3339Nano), id)
		}
	}

	var result struct {
		Data    []*coreTransactionResp `json:"data"`
		HasMore bool                   `json:"has_more"`
	}
	if err := s.client.get(ctx, path, &result); err != nil {
		return nil, err
	}

	txs := make([]*Transaction, len(result.Data))
	for i, r := range result.Data {
		txs[i] = r.toTransaction()
	}

	var nextCursor string
	if result.HasMore && len(txs) > 0 {
		last := txs[len(txs)-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
	}

	return &TransactionPage{
		Data:       txs,
		NextCursor: nextCursor,
		HasMore:    result.HasMore,
	}, nil
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

func (s *CoreApiWalletService) SandboxFund(ctx context.Context, walletID string, amountMinor int64, currency string) (*WalletBalance, error) {
	body := map[string]any{
		"amount_minor": amountMinor,
		"currency":     currency,
	}
	var resp struct {
		WalletID    string `json:"wallet_id"`
		Currency    string `json:"currency"`
		AmountMinor int64  `json:"amount_minor"`
		NewBalance  int64  `json:"new_balance"`
	}
	if err := s.client.post(ctx, "/internal/v1/wallets/"+walletID+"/sandbox-credit", body, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrWalletNotFound
		}
		return nil, err
	}
	return &WalletBalance{
		WalletID:       walletID,
		Currency:       resp.Currency,
		AvailableMinor: resp.NewBalance,
		ReservedMinor:  0,
		TotalMinor:     resp.NewBalance,
		ComputedAt:     time.Now().UTC(),
	}, nil
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
	Verified  bool      `json:"verified"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (r *coreMerchantResp) toMerchantRecord() *MerchantRecord {
	return &MerchantRecord{
		ID:        r.ID,
		Name:      r.Name,
		Email:     r.Email,
		Status:    MerchantStatus(r.Status),
		Verified:  r.Verified,
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.UpdatedAt,
	}
}

// coreApiKeyResp matches the Rust ApiKey struct serialization.
type coreApiKeyResp struct {
	ID          string     `json:"id"`
	MerchantID  string     `json:"merchant_id"`
	Name        string     `json:"name"`
	KeyPrefix   string     `json:"key_prefix"`
	Environment string     `json:"environment"` // "LIVE" | "SANDBOX"
	CreatedAt   time.Time  `json:"created_at"`
	LastUsedAt  *time.Time `json:"last_used_at"`
	RevokedAt   *time.Time `json:"revoked_at"`
}

func (r *coreApiKeyResp) toApiKeyRecord() *ApiKeyRecord {
	env := ApiKeyEnvironmentLive
	if r.Environment == "SANDBOX" {
		env = ApiKeyEnvironmentSandbox
	}
	return &ApiKeyRecord{
		ID:          r.ID,
		MerchantID:  r.MerchantID,
		Name:        r.Name,
		KeyPrefix:   r.KeyPrefix,
		Environment: env,
		CreatedAt:   r.CreatedAt,
		LastUsedAt:  r.LastUsedAt,
		RevokedAt:   r.RevokedAt,
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

func (s *CoreApiMerchantService) CreateApiKey(ctx context.Context, merchantID, name string, env ApiKeyEnvironment) (*ApiKeyWithSecret, error) {
	body := map[string]string{"name": name, "environment": string(env)}
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

func (s *CoreApiMerchantService) VerifyApiKey(ctx context.Context, rawKey string) (*MerchantRecord, ApiKeyEnvironment, error) {
	body := map[string]string{"raw_key": rawKey}
	var resp struct {
		MerchantID     string `json:"merchant_id"`
		MerchantName   string `json:"merchant_name"`
		MerchantStatus string `json:"merchant_status"`
		Environment    string `json:"environment"` // "LIVE" | "SANDBOX"
	}
	if err := s.client.post(ctx, "/internal/v1/auth/verify-key", body, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, "", ErrInvalidApiKey
		}
		return nil, "", ErrInvalidApiKey
	}
	env := ApiKeyEnvironmentLive
	if resp.Environment == "SANDBOX" {
		env = ApiKeyEnvironmentSandbox
	}
	return &MerchantRecord{
		ID:     resp.MerchantID,
		Name:   resp.MerchantName,
		Status: MerchantStatus(resp.MerchantStatus),
	}, env, nil
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

// corePayoutResp mirrors the Rust Payout JSON, where the monetary value is a
// nested Money object { amount_minor, currency } rather than flat fields.
type corePayoutResp struct {
	ID              string        `json:"id"`
	MerchantID      string        `json:"merchant_id"`
	WalletID        string        `json:"wallet_id"`
	IdempotencyKey  string        `json:"idempotency_key"`
	Status          string        `json:"status"`
	Amount          coreMoneyResp `json:"amount"`
	Destination     BankDestination `json:"destination"`
	LedgerPostingID *string       `json:"ledger_posting_id"`
	FailureReason   *string       `json:"failure_reason"`
	CreatedAt       time.Time     `json:"created_at"`
	SentAt          *time.Time    `json:"sent_at"`
	ConfirmedAt     *time.Time    `json:"confirmed_at"`
	ReturnedAt      *time.Time    `json:"returned_at"`
	FailedAt        *time.Time    `json:"failed_at"`
}

func (r *corePayoutResp) toPayout() *Payout {
	return &Payout{
		ID:              r.ID,
		MerchantID:      r.MerchantID,
		WalletID:        r.WalletID,
		IdempotencyKey:  r.IdempotencyKey,
		Status:          PayoutStatus(r.Status),
		AmountMinor:     r.Amount.AmountMinor,
		Currency:        r.Amount.Currency,
		Destination:     r.Destination,
		LedgerPostingID: r.LedgerPostingID,
		FailureReason:   r.FailureReason,
		CreatedAt:       r.CreatedAt,
		SentAt:          r.SentAt,
		ConfirmedAt:     r.ConfirmedAt,
		ReturnedAt:      r.ReturnedAt,
		FailedAt:        r.FailedAt,
	}
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
	var resp corePayoutResp
	if err := s.client.post(ctx, "/internal/v1/payouts", body, &resp); err != nil {
		if strings.Contains(err.Error(), "INSUFFICIENT") {
			return nil, ErrPayoutInsufficientFunds
		}
		return nil, err
	}
	return resp.toPayout(), nil
}

func (s *CoreApiPayoutService) Get(
	ctx context.Context,
	_ string,
	id string,
) (*Payout, error) {
	var resp corePayoutResp
	if err := s.client.get(ctx, "/internal/v1/payouts/"+id, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrPayoutNotFound
		}
		return nil, err
	}
	return resp.toPayout(), nil
}

func (s *CoreApiPayoutService) List(
	ctx context.Context,
	merchantID string,
	limit int,
) ([]*Payout, error) {
	path := fmt.Sprintf("/internal/v1/payouts?merchant_id=%s&limit=%d", merchantID, limit)
	var result struct {
		Data []*corePayoutResp `json:"data"`
	}
	if err := s.client.get(ctx, path, &result); err != nil {
		return nil, err
	}
	out := make([]*Payout, len(result.Data))
	for i, r := range result.Data {
		out[i] = r.toPayout()
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// CoreApiConsumerService — implements ConsumerService via the Rust core
// ---------------------------------------------------------------------------

type CoreApiConsumerService struct {
	client *CoreApiClient
}

func NewCoreApiConsumerService(client *CoreApiClient) *CoreApiConsumerService {
	return &CoreApiConsumerService{client: client}
}

type coreConsumerResp struct {
	ID          string     `json:"id"`
	Handle      string     `json:"handle"`
	DisplayName *string    `json:"display_name"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

func (r *coreConsumerResp) toConsumerRecord() *ConsumerRecord {
	return &ConsumerRecord{
		ID:          r.ID,
		Handle:      r.Handle,
		DisplayName: r.DisplayName,
		Status:      r.Status,
		CreatedAt:   r.CreatedAt,
		UpdatedAt:   r.UpdatedAt,
	}
}

func (s *CoreApiConsumerService) Create(
	ctx context.Context,
	handle string,
	displayName *string,
) (*ConsumerRecord, error) {
	body := map[string]any{"handle": handle, "display_name": displayName}
	var resp coreConsumerResp
	if err := s.client.post(ctx, "/internal/v1/consumers", body, &resp); err != nil {
		return nil, err
	}
	return resp.toConsumerRecord(), nil
}

func (s *CoreApiConsumerService) Get(ctx context.Context, id string) (*ConsumerRecord, error) {
	var resp coreConsumerResp
	if err := s.client.get(ctx, "/internal/v1/consumers/"+id, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrConsumerNotFound
		}
		return nil, err
	}
	return resp.toConsumerRecord(), nil
}

func (s *CoreApiConsumerService) GetByHandle(ctx context.Context, handle string) (*ConsumerRecord, error) {
	var resp coreConsumerResp
	if err := s.client.get(ctx, "/internal/v1/consumers/handle/"+handle, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrHandleNotFound
		}
		return nil, err
	}
	return resp.toConsumerRecord(), nil
}

func (s *CoreApiConsumerService) Suspend(ctx context.Context, id string) (*ConsumerRecord, error) {
	var resp coreConsumerResp
	if err := s.client.post(ctx, "/internal/v1/consumers/"+id+"/suspend", nil, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrConsumerNotFound
		}
		return nil, err
	}
	return resp.toConsumerRecord(), nil
}

func (s *CoreApiConsumerService) Close(ctx context.Context, id string) (*ConsumerRecord, error) {
	var resp coreConsumerResp
	if err := s.client.post(ctx, "/internal/v1/consumers/"+id+"/close", nil, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrConsumerNotFound
		}
		return nil, err
	}
	return resp.toConsumerRecord(), nil
}

// ---------------------------------------------------------------------------
// CoreApiConsumerWalletService — implements ConsumerWalletService via the Rust core
// ---------------------------------------------------------------------------

type CoreApiConsumerWalletService struct {
	client *CoreApiClient
}

func NewCoreApiConsumerWalletService(client *CoreApiClient) *CoreApiConsumerWalletService {
	return &CoreApiConsumerWalletService{client: client}
}

type coreConsumerWalletResp struct {
	ID                 string    `json:"id"`
	ConsumerID         string    `json:"consumer_id"`
	Currency           string    `json:"currency"`
	Status             string    `json:"status"`
	AvailableAccountID string    `json:"available_account_id"`
	ReservedAccountID  string    `json:"reserved_account_id"`
	CreatedAt          time.Time `json:"created_at"`
}

func (r *coreConsumerWalletResp) toRecord() *ConsumerWalletRecord {
	return &ConsumerWalletRecord{
		ID:                 r.ID,
		ConsumerID:         r.ConsumerID,
		Currency:           r.Currency,
		Status:             r.Status,
		AvailableAccountID: r.AvailableAccountID,
		ReservedAccountID:  r.ReservedAccountID,
		CreatedAt:          r.CreatedAt,
	}
}

type coreConsumerWalletBalanceResp struct {
	WalletID   string        `json:"wallet_id"`
	ConsumerID string        `json:"consumer_id"`
	Currency   string        `json:"currency"`
	Available  coreMoneyResp `json:"available"`
	Reserved   coreMoneyResp `json:"reserved"`
	Total      coreMoneyResp `json:"total"`
	ComputedAt time.Time     `json:"computed_at"`
}

func (s *CoreApiConsumerWalletService) GetOrCreate(
	ctx context.Context,
	consumerID, currency string,
) (*ConsumerWalletRecord, error) {
	body := map[string]string{"consumer_id": consumerID, "currency": currency}
	var resp coreConsumerWalletResp
	if err := s.client.post(ctx, "/internal/v1/consumer-wallets", body, &resp); err != nil {
		return nil, err
	}
	return resp.toRecord(), nil
}

func (s *CoreApiConsumerWalletService) Get(ctx context.Context, id string) (*ConsumerWalletRecord, error) {
	var resp coreConsumerWalletResp
	if err := s.client.get(ctx, "/internal/v1/consumer-wallets/"+id, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrConsumerWalletNotFound
		}
		return nil, err
	}
	return resp.toRecord(), nil
}

func (s *CoreApiConsumerWalletService) Balance(ctx context.Context, id string) (*ConsumerWalletBalance, error) {
	var resp coreConsumerWalletBalanceResp
	if err := s.client.get(ctx, "/internal/v1/consumer-wallets/"+id+"/balance", &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrConsumerWalletNotFound
		}
		return nil, err
	}
	return &ConsumerWalletBalance{
		WalletID:       resp.WalletID,
		ConsumerID:     resp.ConsumerID,
		Currency:       resp.Currency,
		AvailableMinor: resp.Available.AmountMinor,
		ReservedMinor:  resp.Reserved.AmountMinor,
		TotalMinor:     resp.Total.AmountMinor,
		ComputedAt:     resp.ComputedAt,
	}, nil
}

func (s *CoreApiConsumerWalletService) GetForConsumer(
	ctx context.Context,
	consumerID, currency string,
) (*ConsumerWalletRecord, error) {
	path := fmt.Sprintf("/internal/v1/consumer-wallets?consumer_id=%s&currency=%s", consumerID, currency)
	var resp coreConsumerWalletResp
	if err := s.client.get(ctx, path, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrNoWalletForConsumer
		}
		return nil, err
	}
	return resp.toRecord(), nil
}

// ---------------------------------------------------------------------------
// CoreApiTransferService — implements TransferService via the Rust core
// ---------------------------------------------------------------------------

type CoreApiTransferService struct {
	client *CoreApiClient
}

func NewCoreApiTransferService(client *CoreApiClient) *CoreApiTransferService {
	return &CoreApiTransferService{client: client}
}

type coreTransferResp struct {
	ID              string        `json:"id"`
	IdempotencyKey  string        `json:"idempotency_key"`
	SenderID        string        `json:"sender_id"`
	RecipientID     string        `json:"recipient_id"`
	Amount          coreMoneyResp `json:"amount"`
	Currency        string        `json:"currency"`
	Status          string        `json:"status"`
	Description     *string       `json:"description"`
	FailureReason   *string       `json:"failure_reason"`
	LedgerPostingID *string       `json:"ledger_posting_id"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`
}

func (r *coreTransferResp) toTransfer() *Transfer {
	return &Transfer{
		ID:             r.ID,
		IdempotencyKey: r.IdempotencyKey,
		SenderID:       r.SenderID,
		RecipientID:    r.RecipientID,
		Amount: TransferMoney{
			AmountMinor: r.Amount.AmountMinor,
			Currency:    r.Amount.Currency,
		},
		Currency:        r.Currency,
		Status:          r.Status,
		Description:     r.Description,
		FailureReason:   r.FailureReason,
		LedgerPostingID: r.LedgerPostingID,
		CreatedAt:       r.CreatedAt,
		UpdatedAt:       r.UpdatedAt,
	}
}

func (s *CoreApiTransferService) Send(
	ctx context.Context,
	req SendTransferRequest,
) (*Transfer, error) {
	body := map[string]any{
		"idempotency_key": req.IdempotencyKey,
		"sender_id":       req.SenderID,
		"recipient_id":    req.RecipientID,
		"amount_minor":    req.AmountMinor,
		"currency":        req.Currency,
		"description":     req.Description,
	}
	var resp coreTransferResp
	if err := s.client.post(ctx, "/internal/v1/transfers", body, &resp); err != nil {
		return nil, err
	}
	return resp.toTransfer(), nil
}

func (s *CoreApiTransferService) Get(ctx context.Context, id string) (*Transfer, error) {
	var resp coreTransferResp
	if err := s.client.get(ctx, "/internal/v1/transfers/"+id, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrTransferNotFound
		}
		return nil, err
	}
	return resp.toTransfer(), nil
}

func (s *CoreApiTransferService) List(
	ctx context.Context,
	consumerID string,
	limit int,
	cursor string,
) (*TransferPage, error) {
	if limit <= 0 {
		limit = 20
	}
	path := fmt.Sprintf("/internal/v1/transfers?consumer_id=%s&limit=%d", consumerID, limit)
	if cursor != "" {
		ts, id, err := decodeCursor(cursor)
		if err == nil {
			path += fmt.Sprintf("&before_created_at=%s&before_id=%s",
				ts.UTC().Format(time.RFC3339Nano), id)
		}
	}

	var result struct {
		Data    []*coreTransferResp `json:"data"`
		HasMore bool                `json:"has_more"`
	}
	if err := s.client.get(ctx, path, &result); err != nil {
		return nil, err
	}

	transfers := make([]*Transfer, len(result.Data))
	for i, r := range result.Data {
		transfers[i] = r.toTransfer()
	}

	var nextCursor string
	if result.HasMore && len(transfers) > 0 {
		last := transfers[len(transfers)-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
	}

	return &TransferPage{
		Data:       transfers,
		HasMore:    result.HasMore,
		NextCursor: nextCursor,
	}, nil
}

// ---------------------------------------------------------------------------
// CoreApiQrService — implements QrService via the Rust core
// ---------------------------------------------------------------------------

type CoreApiQrService struct {
	client *CoreApiClient
}

func NewCoreApiQrService(client *CoreApiClient) *CoreApiQrService {
	return &CoreApiQrService{client: client}
}

type coreQrCodeResp struct {
	ID          string     `json:"id"`
	OwnerID     string     `json:"owner_id"`
	OwnerType   string     `json:"owner_type"`
	QrType      string     `json:"qr_type"`
	Currency    string     `json:"currency"`
	AmountMinor *int64     `json:"amount_minor"`
	Status      string     `json:"status"`
	ExpiresAt   *time.Time `json:"expires_at"`
	UsedAt      *time.Time `json:"used_at"`
	Reference   *string    `json:"reference"`
	CreatedAt   time.Time  `json:"created_at"`
}

func (r *coreQrCodeResp) toRecord() *QrCodeRecord {
	return &QrCodeRecord{
		ID:          r.ID,
		OwnerID:     r.OwnerID,
		OwnerType:   r.OwnerType,
		QrType:      r.QrType,
		Currency:    r.Currency,
		AmountMinor: r.AmountMinor,
		Status:      r.Status,
		ExpiresAt:   r.ExpiresAt,
		UsedAt:      r.UsedAt,
		Reference:   r.Reference,
		CreatedAt:   r.CreatedAt,
	}
}

type coreQrResponseResp struct {
	QrCode  coreQrCodeResp `json:"qr_code"`
	Payload string         `json:"payload"`
}

func (r *coreQrResponseResp) toQrResponse() *QrResponse {
	return &QrResponse{
		QrCode:  r.QrCode.toRecord(),
		Payload: r.Payload,
	}
}

type coreParsedQrResp struct {
	QrType    string  `json:"qr_type"`
	OwnerID   *string `json:"owner_id"`
	OwnerType *string `json:"owner_type"`
	Currency  *string `json:"currency"`
	QrCodeID  *string `json:"qr_code_id"`
}

func (s *CoreApiQrService) CreateStatic(
	ctx context.Context,
	req CreateStaticQrRequest,
) (*QrResponse, error) {
	body := map[string]any{
		"owner_id":     req.OwnerID,
		"owner_type":   req.OwnerType,
		"currency":     req.Currency,
		"amount_minor": req.AmountMinor,
	}
	var resp coreQrResponseResp
	if err := s.client.post(ctx, "/internal/v1/qr/static", body, &resp); err != nil {
		return nil, err
	}
	return resp.toQrResponse(), nil
}

func (s *CoreApiQrService) CreateDynamic(
	ctx context.Context,
	req CreateDynamicQrRequest,
) (*QrResponse, error) {
	body := map[string]any{
		"owner_id":     req.OwnerID,
		"owner_type":   req.OwnerType,
		"currency":     req.Currency,
		"amount_minor": req.AmountMinor,
		"expires_at":   req.ExpiresAt.UTC().Format(time.RFC3339),
		"reference":    req.Reference,
	}
	var resp coreQrResponseResp
	if err := s.client.post(ctx, "/internal/v1/qr/dynamic", body, &resp); err != nil {
		return nil, err
	}
	return resp.toQrResponse(), nil
}

func (s *CoreApiQrService) Get(ctx context.Context, id string) (*QrResponse, error) {
	var resp coreQrResponseResp
	if err := s.client.get(ctx, "/internal/v1/qr/"+id, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrQrNotFound
		}
		return nil, err
	}
	return resp.toQrResponse(), nil
}

func (s *CoreApiQrService) Decode(ctx context.Context, payload string) (*ParsedQr, error) {
	body := map[string]string{"payload": payload}
	var resp coreParsedQrResp
	if err := s.client.post(ctx, "/internal/v1/qr/decode", body, &resp); err != nil {
		return nil, err
	}
	return &ParsedQr{
		QrType:    resp.QrType,
		OwnerID:   resp.OwnerID,
		OwnerType: resp.OwnerType,
		Currency:  resp.Currency,
		QrCodeID:  resp.QrCodeID,
	}, nil
}

func (s *CoreApiQrService) MarkUsed(ctx context.Context, id string) (*QrCodeRecord, error) {
	var resp coreQrCodeResp
	if err := s.client.post(ctx, "/internal/v1/qr/"+id+"/use", nil, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrQrNotFound
		}
		return nil, err
	}
	return resp.toRecord(), nil
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
	if resp.StatusCode == http.StatusUnprocessableEntity {
		var e coreErrBody
		_ = json.Unmarshal(raw, &e)
		return fmt.Errorf("core-api 422 %s: %s", e.Error.Code, e.Error.Message)
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
