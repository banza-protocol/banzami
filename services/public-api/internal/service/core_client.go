// Package service provides a CorePublicClient for delegating financial operations
// to the Rust core-api. The public-api never writes financial data directly —
// all monetary operations go through the core's internal endpoints.
package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// ErrNotFound is returned when the requested resource does not exist in the core.
var ErrNotFound = errors.New("resource not found")

// Sentinel domain errors used by handlers for specific error responses.
var (
	ErrConsumerNotFound          = errors.New("consumer not found")
	ErrHandleTaken               = errors.New("handle already taken")
	ErrConsumerWalletNotFound    = errors.New("consumer wallet not found")
	ErrTransferNotFound          = errors.New("transfer not found")
	ErrTransferSelfTransfer      = errors.New("cannot transfer to yourself")
	ErrTransferInvalidAmount     = errors.New("amount must be positive")
	ErrTransferInsufficientFunds = errors.New("insufficient funds")
	ErrTransferWalletNotFound    = errors.New("sender or recipient wallet not found")
	ErrPaymentLinkNotFound       = errors.New("payment link not found")
	ErrPaymentLinkNotActive      = errors.New("payment link is no longer active")
)

// CorePublicClient is a thin HTTP client over the Rust core-api internal endpoints.
type CorePublicClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewCorePublicClient(baseURL string) *CorePublicClient {
	return &CorePublicClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type ConsumerRecord struct {
	ID                 string    `json:"id"`
	Handle             string    `json:"handle"`
	DisplayName        *string   `json:"display_name"`
	Status             string    `json:"status"`
	VerificationBadge  *string   `json:"verification_badge"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type ConsumerWalletRecord struct {
	ID                 string    `json:"id"`
	ConsumerID         string    `json:"consumer_id"`
	Currency           string    `json:"currency"`
	Status             string    `json:"status"`
	AvailableAccountID string    `json:"available_account_id"`
	ReservedAccountID  string    `json:"reserved_account_id"`
	CreatedAt          time.Time `json:"created_at"`
}

type ConsumerWalletBalance struct {
	WalletID       string    `json:"wallet_id"`
	ConsumerID     string    `json:"consumer_id"`
	Currency       string    `json:"currency"`
	AvailableMinor int64     `json:"available_minor"`
	ReservedMinor  int64     `json:"reserved_minor"`
	TotalMinor     int64     `json:"total_minor"`
	ComputedAt     time.Time `json:"computed_at"`
}

type TransferMoney struct {
	AmountMinor int64  `json:"amount_minor"`
	Currency    string `json:"currency"`
}

type Transfer struct {
	ID              string        `json:"id"`
	IdempotencyKey  string        `json:"idempotency_key"`
	SenderID        string        `json:"sender_id"`
	RecipientID     string        `json:"recipient_id"`
	Amount          TransferMoney `json:"amount"`
	Currency        string        `json:"currency"`
	Status          string        `json:"status"`
	Description     *string       `json:"description"`
	FailureReason   *string       `json:"failure_reason"`
	LedgerPostingID *string       `json:"ledger_posting_id"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`
}

type TransferPage struct {
	Data       []*Transfer `json:"data"`
	HasMore    bool        `json:"has_more"`
	NextCursor string      `json:"next_cursor,omitempty"`
}

type PaymentLink struct {
	ID          string     `json:"id"`
	Slug        string     `json:"slug"`
	MerchantID  string     `json:"merchant_id"`
	WalletID    string     `json:"wallet_id"`
	AmountMinor *int64     `json:"amount_minor"`
	Currency    string     `json:"currency"`
	Description *string    `json:"description"`
	Status      string     `json:"status"`
	ExpiresAt   *time.Time `json:"expires_at"`
	PaidAt      *time.Time `json:"paid_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// ---------------------------------------------------------------------------
// Consumer operations
// ---------------------------------------------------------------------------

func (c *CorePublicClient) CreateConsumer(ctx context.Context, handle string, displayName *string) (*ConsumerRecord, error) {
	body := map[string]any{"handle": handle, "display_name": displayName}
	var out ConsumerRecord
	if err := c.post(ctx, "/internal/v1/consumers", body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *CorePublicClient) GetConsumer(ctx context.Context, id string) (*ConsumerRecord, error) {
	var out ConsumerRecord
	if err := c.get(ctx, "/internal/v1/consumers/"+id, &out); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrConsumerNotFound
		}
		return nil, err
	}
	return &out, nil
}

func (c *CorePublicClient) GetConsumerByHandle(ctx context.Context, handle string) (*ConsumerRecord, error) {
	var out ConsumerRecord
	if err := c.get(ctx, "/internal/v1/consumers/handle/"+handle, &out); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrConsumerNotFound
		}
		return nil, err
	}
	return &out, nil
}

// ConsumerSuggestion is a minimal public view of a consumer for handle autocomplete.
type ConsumerSuggestion struct {
	Handle      string  `json:"handle"`
	DisplayName *string `json:"display_name"`
}

// SearchConsumers returns up to [limit] active consumers whose handle contains [q].
// Results are filtered to ACTIVE status only.
func (c *CorePublicClient) SearchConsumers(ctx context.Context, q string, limit int) ([]ConsumerSuggestion, error) {
	p := url.Values{}
	p.Set("handle", q)
	p.Set("limit", strconv.Itoa(limit))

	var resp struct {
		Data []struct {
			Handle      string  `json:"handle"`
			DisplayName *string `json:"display_name"`
			Status      string  `json:"status"`
		} `json:"data"`
	}
	if err := c.get(ctx, "/internal/v1/consumers?"+p.Encode(), &resp); err != nil {
		return nil, err
	}

	out := make([]ConsumerSuggestion, 0, len(resp.Data))
	for _, r := range resp.Data {
		if r.Status != "ACTIVE" {
			continue
		}
		out = append(out, ConsumerSuggestion{Handle: r.Handle, DisplayName: r.DisplayName})
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Consumer wallet operations
// ---------------------------------------------------------------------------

func (c *CorePublicClient) GetOrCreateWallet(ctx context.Context, consumerID, currency string) (*ConsumerWalletRecord, error) {
	body := map[string]string{"consumer_id": consumerID, "currency": currency}
	var out ConsumerWalletRecord
	if err := c.post(ctx, "/internal/v1/consumer-wallets", body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *CorePublicClient) GetWalletBalance(ctx context.Context, walletID string) (*ConsumerWalletBalance, error) {
	var resp struct {
		WalletID   string        `json:"wallet_id"`
		ConsumerID string        `json:"consumer_id"`
		Currency   string        `json:"currency"`
		Available  moneyResp     `json:"available"`
		Reserved   moneyResp     `json:"reserved"`
		Total      moneyResp     `json:"total"`
		ComputedAt time.Time     `json:"computed_at"`
	}
	if err := c.get(ctx, "/internal/v1/consumer-wallets/"+walletID+"/balance", &resp); err != nil {
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

func (c *CorePublicClient) GetWalletForConsumer(ctx context.Context, consumerID, currency string) (*ConsumerWalletRecord, error) {
	path := fmt.Sprintf("/internal/v1/consumer-wallets?consumer_id=%s&currency=%s", consumerID, currency)
	var out ConsumerWalletRecord
	if err := c.get(ctx, path, &out); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrConsumerWalletNotFound
		}
		return nil, err
	}
	return &out, nil
}

// ---------------------------------------------------------------------------
// Transfer operations
// ---------------------------------------------------------------------------

type SendTransferRequest struct {
	IdempotencyKey string
	SenderID       string
	RecipientID    string
	AmountMinor    int64
	Currency       string
	Description    string
}

func (c *CorePublicClient) SendTransfer(ctx context.Context, req SendTransferRequest) (*Transfer, error) {
	body := map[string]any{
		"idempotency_key": req.IdempotencyKey,
		"sender_id":       req.SenderID,
		"recipient_id":    req.RecipientID,
		"amount_minor":    req.AmountMinor,
		"currency":        req.Currency,
		"description":     req.Description,
	}
	var resp coreTransferResp
	if err := c.post(ctx, "/internal/v1/transfers", body, &resp); err != nil {
		// Propagate domain errors from core error messages.
		return nil, mapTransferError(err)
	}
	return resp.toTransfer(), nil
}

func (c *CorePublicClient) GetTransfer(ctx context.Context, id string) (*Transfer, error) {
	var resp coreTransferResp
	if err := c.get(ctx, "/internal/v1/transfers/"+id, &resp); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrTransferNotFound
		}
		return nil, err
	}
	return resp.toTransfer(), nil
}

func (c *CorePublicClient) ListTransfers(ctx context.Context, consumerID string, limit int, cursor string) (*TransferPage, error) {
	if limit <= 0 {
		limit = 20
	}
	path := fmt.Sprintf("/internal/v1/transfers?consumer_id=%s&limit=%d", consumerID, limit)
	if cursor != "" {
		path += "&cursor=" + cursor
	}

	var result struct {
		Data    []*coreTransferResp `json:"data"`
		HasMore bool                `json:"has_more"`
	}
	if err := c.get(ctx, path, &result); err != nil {
		return nil, err
	}

	transfers := make([]*Transfer, len(result.Data))
	for i, r := range result.Data {
		transfers[i] = r.toTransfer()
	}

	var nextCursor string
	if result.HasMore && len(transfers) > 0 {
		last := transfers[len(transfers)-1]
		nextCursor = last.ID
	}

	return &TransferPage{
		Data:       transfers,
		HasMore:    result.HasMore,
		NextCursor: nextCursor,
	}, nil
}

// SandboxCreditConsumer injects virtual funds into a consumer's available ledger account.
// Only callable when the service is deployed in SANDBOX environment.
func (c *CorePublicClient) SandboxCreditConsumer(ctx context.Context, consumerID string, amountMinor int64, currency string) (int64, error) {
	body := map[string]any{
		"consumer_id":  consumerID,
		"amount_minor": amountMinor,
		"currency":     currency,
	}
	var resp struct {
		NewBalance int64 `json:"new_balance"`
	}
	if err := c.post(ctx, "/internal/v1/consumer-wallets/test-credit", body, &resp); err != nil {
		return 0, err
	}
	return resp.NewBalance, nil
}

// ---------------------------------------------------------------------------
// Merchant lookup (read-only; used to enrich payment link responses)
// ---------------------------------------------------------------------------

type MerchantRecord struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (c *CorePublicClient) GetMerchant(ctx context.Context, id string) (*MerchantRecord, error) {
	var out MerchantRecord
	if err := c.get(ctx, "/internal/v1/merchants/"+id, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ---------------------------------------------------------------------------
// Payment link operations
// ---------------------------------------------------------------------------

func (c *CorePublicClient) GetPaymentLinkBySlug(ctx context.Context, slug string) (*PaymentLink, error) {
	var out PaymentLink
	if err := c.get(ctx, "/internal/v1/payment-links/by-slug/"+slug, &out); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrPaymentLinkNotFound
		}
		return nil, err
	}
	return &out, nil
}

func (c *CorePublicClient) MarkPaymentLinkUsed(ctx context.Context, id string) (*PaymentLink, error) {
	var out PaymentLink
	if err := c.post(ctx, "/internal/v1/payment-links/"+id+"/mark-used", nil, &out); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrPaymentLinkNotFound
		}
		return nil, mapPaymentLinkError(err)
	}
	return &out, nil
}

// ---------------------------------------------------------------------------
// Internal response types
// ---------------------------------------------------------------------------

type moneyResp struct {
	AmountMinor int64  `json:"amount_minor"`
	Currency    string `json:"currency"`
}

type coreTransferResp struct {
	ID              string     `json:"id"`
	IdempotencyKey  string     `json:"idempotency_key"`
	SenderID        string     `json:"sender_id"`
	RecipientID     string     `json:"recipient_id"`
	Amount          moneyResp  `json:"amount"`
	Currency        string     `json:"currency"`
	Status          string     `json:"status"`
	Description     *string    `json:"description"`
	FailureReason   *string    `json:"failure_reason"`
	LedgerPostingID *string    `json:"ledger_posting_id"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
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

func mapTransferError(err error) error {
	msg := err.Error()
	switch {
	case contains(msg, "SELF_TRANSFER"):
		return ErrTransferSelfTransfer
	case contains(msg, "INVALID_AMOUNT"):
		return ErrTransferInvalidAmount
	case contains(msg, "INSUFFICIENT_FUNDS"):
		return ErrTransferInsufficientFunds
	case contains(msg, "WALLET_NOT_FOUND"):
		return ErrTransferWalletNotFound
	default:
		return err
	}
}

func mapPaymentLinkError(err error) error {
	if contains(err.Error(), "NOT_ACTIVE") || contains(err.Error(), "NotActive") {
		return ErrPaymentLinkNotActive
	}
	return err
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr ||
		len(s) > 0 && len(substr) > 0 &&
			func() bool {
				for i := 0; i <= len(s)-len(substr); i++ {
					if s[i:i+len(substr)] == substr {
						return true
					}
				}
				return false
			}())
}

// ---------------------------------------------------------------------------
// Low-level HTTP helpers
// ---------------------------------------------------------------------------

func (c *CorePublicClient) post(ctx context.Context, path string, body any, out any) error {
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

func (c *CorePublicClient) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("core-api request: %w", err)
	}
	return c.do(req, out)
}

func (c *CorePublicClient) do(req *http.Request, out any) error {
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
