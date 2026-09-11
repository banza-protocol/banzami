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
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/banzami/banzami/services/common/corepath"
	"github.com/banzami/banzami/services/common/obs"
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
	// coreInternalKey authenticates this gateway to Core's protected internal
	// route groups (sent as X-Internal-Key). Empty → header omitted (Core's
	// service-authed groups then fail closed).
	coreInternalKey string
}

func NewCoreApiClient(baseURL, coreInternalKey string) *CoreApiClient {
	return &CoreApiClient{
		baseURL:         baseURL,
		coreInternalKey: coreInternalKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			// Propagate the flow's correlation_id to core-api so Go and Rust logs
			// can be joined end-to-end, and authenticate every request.
			Transport: coreKeyTransport{key: coreInternalKey, base: obs.NewPropagationTransport(nil)},
		},
	}
}

// coreKeyTransport attaches Core's service credential (X-Internal-Key,
// CORE_INTERNAL_KEY) to every request this client sends. Core authenticates
// every /internal route, so a request without it is refused; a request that
// already carries a dedicated key (a narrower credential for one route group)
// keeps it. The value is never logged.
type coreKeyTransport struct {
	key  string
	base http.RoundTripper
}

func (t coreKeyTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if t.key != "" && r.Header.Get("X-Internal-Key") == "" {
		r = r.Clone(r.Context())
		r.Header.Set("X-Internal-Key", t.key)
	}
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(r)
}

// coreReqOption mutates an outgoing Core request before it is sent. Reusable,
// but each option must be passed EXPLICITLY per call — nothing is attached by
// default, so a credential can never travel to an unrelated route group.
type coreReqOption func(*http.Request)

// internalAuth attaches the Gateway→Core service credential (X-Internal-Key)
// explicitly. It was once the ONLY carrier of CORE_INTERNAL_KEY (refunds); since
// Core authenticates every /internal route, coreKeyTransport sends it on every
// request and this remains for the refund calls that name it. The value is
// never logged (only method/path/status are traced).
func (c *CoreApiClient) internalAuth() coreReqOption {
	return func(req *http.Request) {
		if c.coreInternalKey != "" {
			req.Header.Set("X-Internal-Key", c.coreInternalKey)
		}
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

// toTransaction labels the record with the environment of the session that
// asked — the stack's own. It used to say "LIVE" for every transaction,
// including Sandbox SimulatePayment ones, which the SDK types as 'LIVE' |
// 'SANDBOX' (A2-14).
func (r *coreTransactionResp) toTransaction(environment string) *Transaction {
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
		Environment:    environment,
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
	// The server-resolved policy, and nothing else. Omitted when empty rather
	// than sent blank — but empty is now a refusal upstream, not a free
	// transaction, so an omission here fails loudly instead of quietly costing
	// the operator its fee.
	if req.PricingProfile != "" {
		body["pricing_profile"] = req.PricingProfile
	}

	var resp coreTransactionResp
	if err := s.client.post(ctx, "/internal/v1/transactions", body, &resp); err != nil {
		return nil, err
	}
	return resp.toTransaction(req.Environment), nil
}

func (s *CoreApiTransactionService) Get(
	ctx context.Context,
	merchantID string,
	id string,
	environment string,
) (*Transaction, error) {
	// A1-01: the merchant used to be dropped here ("validated in the handler" —
	// it was not), and core read any transaction by id alone. Core now requires
	// the owner and answers 404 for anyone else's; the comparison below keeps
	// that true even against a core that forgot.
	var resp coreTransactionResp
	path := "/internal/v1/transactions/" + url.PathEscape(id) + "?merchant_id=" + url.QueryEscape(merchantID)
	if err := s.client.get(ctx, path, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrTransactionNotFound
		}
		return nil, err
	}
	if !strings.EqualFold(resp.MerchantID, merchantID) {
		return nil, ErrTransactionNotFound
	}
	return resp.toTransaction(environment), nil
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
		url.QueryEscape(req.MerchantID), limit)

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
		txs[i] = r.toTransaction(req.Environment)
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
	HeldMinor  int64         `json:"held_minor"`
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
	if err := s.client.get(ctx, "/internal/v1/wallets/"+url.PathEscape(id), &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrWalletNotFound
		}
		return nil, err
	}
	return resp.toWalletRecord(), nil
}

func (s *CoreApiWalletService) Balance(ctx context.Context, id string) (*WalletBalance, error) {
	var resp coreWalletBalanceResp
	if err := s.client.get(ctx, "/internal/v1/wallets/"+url.PathEscape(id)+"/balance", &resp); err != nil {
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
		HeldMinor:      resp.HeldMinor,
		ComputedAt:     resp.ComputedAt,
	}, nil
}

func (s *CoreApiWalletService) Analytics(ctx context.Context, walletID, from, to string) (json.RawMessage, error) {
	path := "/internal/v1/wallets/" + url.PathEscape(walletID) + "/analytics"
	sep := "?"
	if from != "" {
		path += sep + "from=" + url.QueryEscape(from)
		sep = "&"
	}
	if to != "" {
		path += sep + "to=" + url.QueryEscape(to)
	}
	var resp json.RawMessage
	if err := s.client.get(ctx, path, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrWalletNotFound
		}
		return nil, err
	}
	return resp, nil
}

func (s *CoreApiWalletService) GetForMerchant(ctx context.Context, merchantID, currency string) (*WalletRecord, error) {
	path := fmt.Sprintf("/internal/v1/wallets?merchant_id=%s&currency=%s", url.QueryEscape(merchantID), url.QueryEscape(currency))
	var resp coreWalletResp
	if err := s.client.get(ctx, path, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrWalletNotFound
		}
		return nil, err
	}
	return resp.toWalletRecord(), nil
}

func (s *CoreApiWalletService) SandboxFund(ctx context.Context, walletID string, amountMinor int64, currency, idempotencyKey string) (*WalletBalance, error) {
	body := map[string]any{
		"amount_minor": amountMinor,
		"currency":     currency,
	}
	if idempotencyKey != "" {
		body["idempotency_key"] = idempotencyKey // one credit per key (core credit_idempotency)
	}
	var resp struct {
		WalletID    string `json:"wallet_id"`
		Currency    string `json:"currency"`
		AmountMinor int64  `json:"amount_minor"`
		NewBalance  int64  `json:"new_balance"`
	}
	if err := s.client.post(ctx, "/internal/v1/wallets/"+url.PathEscape(walletID)+"/sandbox-credit", body, &resp); err != nil {
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
	if err := s.client.get(ctx, "/internal/v1/merchants/"+url.PathEscape(id), &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrMerchantNotFound
		}
		return nil, err
	}
	return resp.toMerchantRecord(), nil
}

func (s *CoreApiMerchantService) Suspend(ctx context.Context, id string) (*MerchantRecord, error) {
	var resp coreMerchantResp
	if err := s.client.post(ctx, "/internal/v1/merchants/"+url.PathEscape(id)+"/suspend", nil, &resp); err != nil {
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
	if err := s.client.post(ctx, "/internal/v1/merchants/"+url.PathEscape(merchantID)+"/api-keys", body, &resp); err != nil {
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
	if err := s.client.get(ctx, "/internal/v1/merchants/"+url.PathEscape(merchantID)+"/api-keys", &raw); err != nil {
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
	path := fmt.Sprintf("/internal/v1/merchants/%s/api-keys/%s", url.PathEscape(merchantID), url.PathEscape(keyID))
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
	// The key's environment is what core says it is — LIVE or SANDBOX — and
	// nothing else is guessed. Anything unrecognised used to become LIVE.
	var env ApiKeyEnvironment
	switch resp.Environment {
	case "LIVE":
		env = ApiKeyEnvironmentLive
	case "SANDBOX":
		env = ApiKeyEnvironmentSandbox
	default:
		return nil, "", ErrInvalidApiKey
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
	ID              string          `json:"id"`
	MerchantID      string          `json:"merchant_id"`
	WalletID        string          `json:"wallet_id"`
	IdempotencyKey  string          `json:"idempotency_key"`
	Status          string          `json:"status"`
	Amount          coreMoneyResp   `json:"amount"`
	Destination     BankDestination `json:"destination"`
	LedgerPostingID *string         `json:"ledger_posting_id"`
	FailureReason   *string         `json:"failure_reason"`
	CreatedAt       time.Time       `json:"created_at"`
	SentAt          *time.Time      `json:"sent_at"`
	ConfirmedAt     *time.Time      `json:"confirmed_at"`
	ReturnedAt      *time.Time      `json:"returned_at"`
	FailedAt        *time.Time      `json:"failed_at"`
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
	merchantID string,
	id string,
) (*Payout, error) {
	// RA-056: the merchant scope was discarded here (the parameter was `_`), so
	// any authenticated merchant could read any payout by id — amount, status and
	// the bank destination of another tenant. The core now requires the scope and
	// returns 404 for a payout it does not own.
	var resp corePayoutResp
	path := fmt.Sprintf("/internal/v1/payouts/%s?merchant_id=%s",
		url.PathEscape(id), url.QueryEscape(merchantID))
	if err := s.client.get(ctx, path, &resp); err != nil {
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
	path := fmt.Sprintf("/internal/v1/payouts?merchant_id=%s&limit=%d", url.QueryEscape(merchantID), limit)
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
	ID          string    `json:"id"`
	Handle      string    `json:"handle"`
	DisplayName *string   `json:"display_name"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
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
	if err := s.client.get(ctx, "/internal/v1/consumers/"+url.PathEscape(id), &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrConsumerNotFound
		}
		return nil, err
	}
	return resp.toConsumerRecord(), nil
}

func (s *CoreApiConsumerService) GetByHandle(ctx context.Context, handle string) (*ConsumerRecord, error) {
	var resp coreConsumerResp
	if err := s.client.get(ctx, "/internal/v1/consumers/handle/"+url.PathEscape(handle), &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrHandleNotFound
		}
		return nil, err
	}
	return resp.toConsumerRecord(), nil
}

func (s *CoreApiConsumerService) Suspend(ctx context.Context, id string) (*ConsumerRecord, error) {
	var resp coreConsumerResp
	if err := s.client.post(ctx, "/internal/v1/consumers/"+url.PathEscape(id)+"/suspend", nil, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrConsumerNotFound
		}
		return nil, err
	}
	return resp.toConsumerRecord(), nil
}

func (s *CoreApiConsumerService) Close(ctx context.Context, id string) (*ConsumerRecord, error) {
	var resp coreConsumerResp
	if err := s.client.post(ctx, "/internal/v1/consumers/"+url.PathEscape(id)+"/close", nil, &resp); err != nil {
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
	if err := s.client.get(ctx, "/internal/v1/consumer-wallets/"+url.PathEscape(id), &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrConsumerWalletNotFound
		}
		return nil, err
	}
	return resp.toRecord(), nil
}

func (s *CoreApiConsumerWalletService) Balance(ctx context.Context, id string) (*ConsumerWalletBalance, error) {
	var resp coreConsumerWalletBalanceResp
	if err := s.client.get(ctx, "/internal/v1/consumer-wallets/"+url.PathEscape(id)+"/balance", &resp); err != nil {
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
	path := fmt.Sprintf("/internal/v1/consumer-wallets?consumer_id=%s&currency=%s", url.QueryEscape(consumerID), url.QueryEscape(currency))
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
	if err := s.client.get(ctx, "/internal/v1/transfers/"+url.PathEscape(id), &resp); err != nil {
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
	path := fmt.Sprintf("/internal/v1/transfers?consumer_id=%s&limit=%d", url.QueryEscape(consumerID), limit)
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
	if req.WalletAccountID != "" {
		body["wallet_account_id"] = req.WalletAccountID
	}
	var resp coreQrResponseResp
	if err := s.client.post(ctx, "/internal/v1/qr/dynamic", body, &resp); err != nil {
		return nil, err
	}
	return resp.toQrResponse(), nil
}

func (s *CoreApiQrService) Get(ctx context.Context, id string) (*QrResponse, error) {
	var resp coreQrResponseResp
	if err := s.client.get(ctx, "/internal/v1/qr/"+url.PathEscape(id), &resp); err != nil {
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
	if err := s.client.post(ctx, "/internal/v1/qr/"+url.PathEscape(id)+"/use", nil, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrQrNotFound
		}
		return nil, err
	}
	return resp.toRecord(), nil
}

// Split Sessions (P2P-002) is SUPERSEDED by Collections (ADR-036). The former
// CoreApiSplitService proxy is removed: the gateway answers /v1/splits* at the
// edge with a 410 and never calls Core for it (see handler.SplitsSuperseded).

func (s *CoreApiQrService) Pay(ctx context.Context, req PayQrRequest) (int, json.RawMessage, error) {
	body := map[string]any{
		"idempotency_key": req.IdempotencyKey,
		"payer":           req.Payer,
		"payload":         req.Payload,
		"note":            req.Note,
	}
	if req.AmountMinor != nil {
		body["amount_minor"] = *req.AmountMinor
	}
	if req.DeviceID != "" {
		body["device_id"] = req.DeviceID
	}
	// The core owns the QR resolution, compliance gate, atomic claim and
	// settlement; forward its status + body verbatim so the app sees the exact
	// outcome code.
	return s.client.postRaw(ctx, "/internal/v1/qr/pay", body)
}

// ---------------------------------------------------------------------------
// Low-level HTTP helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Compliance (KYC / KYB) — raw JSON passthrough to the core
// ---------------------------------------------------------------------------

type CoreApiComplianceService struct {
	client *CoreApiClient
}

func NewCoreApiComplianceService(client *CoreApiClient) *CoreApiComplianceService {
	return &CoreApiComplianceService{client: client}
}

func (s *CoreApiComplianceService) VerifyCustomer(ctx context.Context, customerID string, body json.RawMessage) (json.RawMessage, error) {
	var resp json.RawMessage
	if err := s.client.post(ctx, "/internal/v1/compliance/customers/"+url.PathEscape(customerID)+"/verify", body, &resp); err != nil {
		return nil, err
	}
	return resp, nil
}

func (s *CoreApiComplianceService) VerifyMerchant(ctx context.Context, merchantID string, body json.RawMessage) (json.RawMessage, error) {
	var resp json.RawMessage
	if err := s.client.post(ctx, "/internal/v1/compliance/merchants/"+url.PathEscape(merchantID)+"/verify", body, &resp); err != nil {
		return nil, err
	}
	return resp, nil
}

func (s *CoreApiComplianceService) GetCustomerStatus(ctx context.Context, customerID string) (json.RawMessage, error) {
	var resp json.RawMessage
	if err := s.client.get(ctx, "/internal/v1/compliance/customers/"+url.PathEscape(customerID), &resp); err != nil {
		return nil, err
	}
	return resp, nil
}

func (s *CoreApiComplianceService) AuthorizeOperation(ctx context.Context, customerID, operation string, amountMinor, dailyVolumeMinor int64) (*Authorization, error) {
	body := map[string]any{
		"operation":          operation,
		"amount_minor":       amountMinor,
		"daily_volume_minor": dailyVolumeMinor,
	}
	var resp Authorization
	if err := s.client.post(ctx, "/internal/v1/compliance/customers/"+url.PathEscape(customerID)+"/authorize", body, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (s *CoreApiComplianceService) GetMerchantStatus(ctx context.Context, merchantID string) (*MerchantComplianceStatus, error) {
	var resp MerchantComplianceStatus
	if err := s.client.get(ctx, "/internal/v1/compliance/merchants/"+url.PathEscape(merchantID), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// corePathIsWellFormed: see services/common/corepath (A3-01).
func corePathIsWellFormed(path string) bool { return corepath.WellFormed(path) }

// newCoreRequest builds a request to core, refusing a malformed path. A path
// that is not well formed names no resource core holds, so the caller is told
// exactly that: ErrNotFound.
func (c *CoreApiClient) newCoreRequest(ctx context.Context, method, path string, body io.Reader) (*http.Request, error) {
	if !corePathIsWellFormed(path) {
		slog.WarnContext(ctx, "core_path.refused", "method", method)
		return nil, ErrNotFound
	}
	return http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
}

// postRaw sends a POST and returns the core's HTTP status code and raw body
// verbatim, without collapsing error codes into Go errors. This lets a gateway
// handler forward the core's structured responses (e.g. KYC_REQUIRED,
// INSUFFICIENT_FUNDS, QR_ALREADY_USED) to the caller unchanged. Only a transport
// failure returns a non-nil error.
func (c *CoreApiClient) postRaw(ctx context.Context, path string, body any, opts ...coreReqOption) (int, json.RawMessage, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return 0, nil, fmt.Errorf("core-api marshal: %w", err)
	}
	req, err := c.newCoreRequest(ctx, http.MethodPost, path, bytes.NewReader(data))
	if errors.Is(err, ErrNotFound) {
		return http.StatusNotFound, nil, nil
	}
	if err != nil {
		return 0, nil, fmt.Errorf("core-api request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	for _, o := range opts {
		o(req)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("core-api transport: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, json.RawMessage(raw), nil
}

// requestRaw issues an arbitrary-method request and returns the core's status
// code + raw body verbatim, for pass-through forwarding (e.g. Collections).
func (c *CoreApiClient) requestRaw(ctx context.Context, method, path string, body any) (int, json.RawMessage, error) {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return 0, nil, fmt.Errorf("core-api marshal: %w", err)
		}
		reader = bytes.NewReader(data)
	}
	req, err := c.newCoreRequest(ctx, method, path, reader)
	if errors.Is(err, ErrNotFound) {
		return http.StatusNotFound, nil, nil
	}
	if err != nil {
		return 0, nil, fmt.Errorf("core-api request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("core-api transport: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, json.RawMessage(raw), nil
}

func (c *CoreApiClient) post(ctx context.Context, path string, body any, out any) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("core-api marshal: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := c.newCoreRequest(ctx, http.MethodPost, path, bodyReader)
	if errors.Is(err, ErrNotFound) {
		return err
	}
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.do(req, out)
}

func (c *CoreApiClient) get(ctx context.Context, path string, out any, opts ...coreReqOption) error {
	req, err := c.newCoreRequest(ctx, http.MethodGet, path, nil)
	if errors.Is(err, ErrNotFound) {
		return err
	}
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	for _, o := range opts {
		o(req)
	}
	return c.do(req, out)
}

func (c *CoreApiClient) delete(ctx context.Context, path string) error {
	req, err := c.newCoreRequest(ctx, http.MethodDelete, path, nil)
	if errors.Is(err, ErrNotFound) {
		return err
	}
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	return c.do(req, nil)
}

func (c *CoreApiClient) do(req *http.Request, out any) error {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return &TransportError{Err: err}
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)

	// ErrNotFound is kept as the sentinel for 404 because ~38 call sites already
	// branch on it; a CoreError is returned for every other non-2xx so handlers
	// can distinguish a deliberate rejection from a failure (RA-043).
	if resp.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if resp.StatusCode >= 400 {
		var e coreErrBody
		_ = json.Unmarshal(raw, &e) // absent/!JSON body simply yields empty fields
		return &CoreError{Status: resp.StatusCode, Code: e.Error.Code, Message: e.Error.Message}
	}

	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			// An undecodable 2xx is a transport-class failure: core never gave us a
			// usable answer, and the caller learns nothing about its own request.
			return &TransportError{Err: fmt.Errorf("decode: %w", err)}
		}
	}
	return nil
}
