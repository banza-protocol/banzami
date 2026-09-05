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

	"github.com/banzami/banzami/services/common/obs"
	"net/url"
	"strconv"
	"time"
)

// ErrNotFound is returned when the requested resource does not exist in the core.
var ErrNotFound = errors.New("resource not found")

// Sentinel domain errors used by handlers for specific error responses.
var (
	ErrConsumerNotFound             = errors.New("consumer not found")
	ErrHandleTaken                  = errors.New("handle already taken")
	ErrConsumerWalletNotFound       = errors.New("consumer wallet not found")
	ErrTransferNotFound             = errors.New("transfer not found")
	ErrTransferSelfTransfer         = errors.New("cannot transfer to yourself")
	ErrTransferInvalidAmount        = errors.New("amount must be positive")
	ErrTransferInsufficientFunds    = errors.New("insufficient funds")
	ErrTransferWalletNotFound       = errors.New("sender or recipient wallet not found")
	ErrTransferWalletLocked         = errors.New("sender wallet is locked — PIN reset required")
	ErrTransferRecipientNotFound    = errors.New("recipient handle not found")
	ErrTransferRecipientUnavailable = errors.New("recipient cannot receive funds")
	ErrPaymentLinkNotFound          = errors.New("payment link not found")
	ErrPaymentLinkNotActive         = errors.New("payment link is no longer active")

	// Onboarding domain errors
	ErrOtpInvalid         = errors.New("OTP is invalid or expired")
	ErrOtpExpired         = errors.New("onboarding session has expired")
	ErrOnboardingNotFound = errors.New("onboarding session not found")
	ErrInvalidHandle      = errors.New("handle format is invalid")
	ErrDuplicateWallet    = errors.New("consumer already has an active wallet in this currency")
	ErrPinPolicyFailed    = errors.New("PIN does not meet policy requirements")
	ErrInvalidLifecycle   = errors.New("invalid lifecycle state transition")
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
			Timeout:   30 * time.Second,
			Transport: obs.NewPropagationTransport(nil),
		},
	}
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type ConsumerRecord struct {
	ID                string    `json:"id"`
	Handle            string    `json:"handle"`
	DisplayName       *string   `json:"display_name"`
	Status            string    `json:"status"`
	VerificationBadge *string   `json:"verification_badge"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
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
	ID              string     `json:"id"`
	Slug            string     `json:"slug"`
	MerchantID      string     `json:"merchant_id"`
	WalletID        string     `json:"wallet_id"`
	WalletAccountID string     `json:"wallet_account_id"`
	AmountMinor     *int64     `json:"amount_minor"`
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
		WalletID   string    `json:"wallet_id"`
		ConsumerID string    `json:"consumer_id"`
		Currency   string    `json:"currency"`
		Available  moneyResp `json:"available"`
		Reserved   moneyResp `json:"reserved"`
		Total      moneyResp `json:"total"`
		ComputedAt time.Time `json:"computed_at"`
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
	// RecipientAccountID routes the merchant credit to a specific segregated
	// account (ADR-030/042 — e.g. a campaign account behind a payment link).
	RecipientAccountID string
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
	if req.RecipientAccountID != "" {
		body["recipient_account_id"] = req.RecipientAccountID
	}
	var resp coreTransferResp
	if err := c.post(ctx, "/internal/v1/transfers", body, &resp); err != nil {
		// Propagate domain errors from core error messages.
		return nil, mapTransferError(err)
	}
	return resp.toTransfer(), nil
}

// SettleCollectionSurface notifies the core that a surface payment settled, so a
// CollectionShare backed by this surface (BANZA ADR-016) is marked PAID against
// the real transfer. Best-effort + idempotent in the core: a plain payment-link
// (no backing PaymentIntent) is a no-op, and a replay marks nothing twice. It
// never affects the underlying payment, which has already settled.
func (c *CorePublicClient) SettleCollectionSurface(ctx context.Context, surface, surfaceRef, transferID string) {
	body := map[string]any{
		"surface":     surface,
		"surface_ref": surfaceRef,
		"transfer_id": transferID,
		"environment": "",
	}
	_ = c.post(ctx, "/internal/v1/collections/settle-surface", body, nil)
}

// SettlePaymentSessionInterface marks the Payment Session owning a paid interface
// (kind = "link"|"qr") as PAID and emits payment_session.paid (ADR-043). Best-effort
// + idempotent: a plain link/QR with no backing session is a no-op in core.
func (c *CorePublicClient) SettlePaymentSessionInterface(ctx context.Context, kind, refID, transferID, iface string, amountMinor int64) {
	body := map[string]any{
		"transfer_id":  transferID,
		"amount_minor": amountMinor,
		"interface":    iface,
	}
	_ = c.post(ctx, "/internal/v1/payment-sessions/settle-by-interface/"+kind+"/"+refID, body, nil)
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

// ---------------------------------------------------------------------------
// P2P-001/P2P-002 — handle-to-handle consumer transfer (public-facing)
// ---------------------------------------------------------------------------

// SendP2pTransferRequest is the payload for the handle-based P2P transfer route.
type SendP2pTransferRequest struct {
	Sender         string
	Recipient      string
	AmountMinor    int64
	Currency       string
	Note           string
	IdempotencyKey string
}

// P2pTransferResponse is the canonical receipt returned by /internal/v1/consumer/transfers.
// It contains @banza handles, not internal UUIDs.
type P2pTransferResponse struct {
	ID             string    `json:"id"`
	Sender         string    `json:"sender"`
	Recipient      string    `json:"recipient"`
	AmountMinor    int64     `json:"amount_minor"`
	Currency       string    `json:"currency"`
	Status         string    `json:"status"`
	Note           *string   `json:"note"`
	IdempotencyKey string    `json:"idempotency_key"`
	CreatedAt      time.Time `json:"created_at"`
}

// SendP2pTransfer routes money from @sender to @recipient via the P2P-001 handle engine.
// The core validates handles, routing status, and balance in a single atomic transaction.
func (c *CorePublicClient) SendP2pTransfer(ctx context.Context, req SendP2pTransferRequest) (*P2pTransferResponse, error) {
	body := map[string]any{
		"idempotency_key": req.IdempotencyKey,
		"sender":          req.Sender,
		"recipient":       req.Recipient,
		"amount_minor":    req.AmountMinor,
		"currency":        req.Currency,
	}
	if req.Note != "" {
		body["note"] = req.Note
	}
	var out P2pTransferResponse
	if err := c.post(ctx, "/internal/v1/consumer/transfers", body, &out); err != nil {
		return nil, mapP2pTransferError(err)
	}
	return &out, nil
}

func mapP2pTransferError(err error) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	switch {
	case contains(msg, "SELF_TRANSFER") || contains(msg, "cannot transfer to yourself"):
		return ErrTransferSelfTransfer
	case contains(msg, "INVALID_AMOUNT") || contains(msg, "amount_minor must be positive"):
		return ErrTransferInvalidAmount
	case contains(msg, "INSUFFICIENT_FUNDS"):
		return ErrTransferInsufficientFunds
	case contains(msg, "SENDER_WALLET_NOT_ACTIVE"):
		return ErrTransferWalletLocked
	case contains(msg, "RECIPIENT_NOT_FOUND") || contains(msg, "not found"):
		return ErrTransferRecipientNotFound
	case contains(msg, "RECIPIENT_NOT_ROUTABLE") || contains(msg, "cannot receive"):
		return ErrTransferRecipientUnavailable
	case contains(msg, "INVALID_HANDLE") || contains(msg, "invalid handle"):
		return ErrInvalidHandle
	default:
		return err
	}
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

// MarkPaymentLinkUsed marks the link used and, given the transfer that settled
// it, lets core record the refundable wallet payment.
//
// The transfer matters: a link paid on its own has no other writer of
// wallet_payments — the session path only covers links that belong to a session
// — so without it the money arrived and the object a refund names never
// existed. Core's recording is idempotent, so passing it for a session-backed
// link is harmless.
func (c *CorePublicClient) MarkPaymentLinkUsed(ctx context.Context, id, transferID string) (*PaymentLink, error) {
	var out PaymentLink
	body := map[string]string{}
	if transferID != "" {
		body["transfer_id"] = transferID
	}
	if err := c.post(ctx, "/internal/v1/payment-links/"+id+"/mark-used", body, &out); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrPaymentLinkNotFound
		}
		return nil, mapPaymentLinkError(err)
	}
	return &out, nil
}

// ---------------------------------------------------------------------------
// Consumer onboarding operations
// ---------------------------------------------------------------------------

// OnboardingSession is returned by StartOnboarding.
type OnboardingSession struct {
	SessionID   string `json:"session_id"`
	PhoneNumber string `json:"phone_number"`
	Status      string `json:"status"`
}

// OnboardingVerifyResponse is returned by VerifyOtp.
type OnboardingVerifyResponse struct {
	SessionID                     string `json:"session_id"`
	Status                        string `json:"status"`
	ProvisionalAvailableAccountID string `json:"provisional_available_account_id"`
	ProvisionalReservedAccountID  string `json:"provisional_reserved_account_id"`
}

// OnboardingWallet is returned by CompleteOnboarding.
type OnboardingWallet struct {
	WalletID    string `json:"wallet_id"`
	ConsumerID  string `json:"consumer_id"`
	BanzaHandle string `json:"banza_handle"`
	Currency    string `json:"currency"`
	Status      string `json:"status"`
}

// StartOnboarding creates a new PENDING_OTP onboarding session.
// One active session per phone number — a second call for the same phone is idempotent.
func (c *CorePublicClient) StartOnboarding(ctx context.Context, phoneNumber, currency string, otpForTest *string) (*OnboardingSession, error) {
	body := map[string]any{
		"phone_number": phoneNumber,
		"currency":     currency,
	}
	if otpForTest != nil {
		body["otp_plaintext_for_test"] = *otpForTest
	}
	var out OnboardingSession
	if err := c.post(ctx, "/internal/v1/consumer/onboarding/start", body, &out); err != nil {
		return nil, mapOnboardingError(err)
	}
	return &out, nil
}

// VerifyOtp advances the onboarding session from PENDING_OTP to PENDING_PIN.
func (c *CorePublicClient) VerifyOtp(ctx context.Context, sessionID, otpCode string) (*OnboardingVerifyResponse, error) {
	body := map[string]any{
		"session_id": sessionID,
		"otp_code":   otpCode,
	}
	var out OnboardingVerifyResponse
	if err := c.post(ctx, "/internal/v1/consumer/onboarding/verify-otp", body, &out); err != nil {
		return nil, mapOnboardingError(err)
	}
	return &out, nil
}

// CompleteOnboarding sets the handle and PIN, atomically activating the wallet.
func (c *CorePublicClient) CompleteOnboarding(ctx context.Context, sessionID, banzaHandle, pin string) (*OnboardingWallet, error) {
	body := map[string]any{
		"session_id":   sessionID,
		"banza_handle": banzaHandle,
		"pin":          pin,
	}
	var out OnboardingWallet
	if err := c.post(ctx, "/internal/v1/consumer/onboarding/complete", body, &out); err != nil {
		return nil, mapOnboardingError(err)
	}
	return &out, nil
}

func mapOnboardingError(err error) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	switch {
	case contains(msg, "OTP_INVALID"):
		return ErrOtpInvalid
	case contains(msg, "OTP_EXPIRED"):
		return ErrOtpExpired
	case contains(msg, "ONBOARDING_NOT_FOUND") || (contains(msg, "404") && contains(msg, "onboarding")):
		return ErrOnboardingNotFound
	case contains(msg, "HANDLE_TAKEN"):
		return ErrHandleTaken
	case contains(msg, "INVALID_HANDLE"):
		return ErrInvalidHandle
	case contains(msg, "DUPLICATE_WALLET"):
		return ErrDuplicateWallet
	case contains(msg, "PIN_POLICY_FAILED"):
		return ErrPinPolicyFailed
	case contains(msg, "INVALID_LIFECYCLE_STATE"):
		return ErrInvalidLifecycle
	default:
		return err
	}
}

// ---------------------------------------------------------------------------
// WAL-003 — Consumer activity feed
// ---------------------------------------------------------------------------

// ActivityItem is one entry in the consumer's activity feed.
// It is the public projection of a ledger-backed financial event —
// either a P2P transfer or a wallet funding/reversal.
type ActivityItem struct {
	ActivityID              string     `json:"activity_id"`
	Type                    string     `json:"item_type"`
	Direction               string     `json:"direction"`
	AmountMinor             int64      `json:"amount_minor"`
	Currency                string     `json:"currency"`
	Status                  string     `json:"status"`
	CreatedAt               time.Time  `json:"created_at"`
	CompletedAt             *time.Time `json:"completed_at"`
	CounterpartyHandle      *string    `json:"counterparty_handle"`
	CounterpartyDisplayName *string    `json:"counterparty_display_name"`
	Note                    *string    `json:"note"`
	TransferID              *string    `json:"transfer_id"`
	FundingID               *string    `json:"funding_id"`
}

// ActivityPage is the paginated response for GET /v1/me/activity.
type ActivityPage struct {
	Items      []ActivityItem `json:"items"`
	NextCursor *string        `json:"next_cursor"`
	HasMore    bool           `json:"has_more"`
}

// GetActivity returns the consumer's merged activity feed.
// cursor, typeFilter, and directionFilter are optional (pass "" to omit).
func (c *CorePublicClient) GetActivity(
	ctx context.Context,
	consumerID string,
	limit int,
	cursor string,
	typeFilter string,
	directionFilter string,
) (*ActivityPage, error) {
	p := url.Values{}
	p.Set("consumer_id", consumerID)
	p.Set("limit", strconv.Itoa(limit))
	if cursor != "" {
		p.Set("cursor", cursor)
	}
	if typeFilter != "" {
		p.Set("type", typeFilter)
	}
	if directionFilter != "" {
		p.Set("direction", directionFilter)
	}

	var out ActivityPage
	if err := c.get(ctx, "/internal/v1/consumer/activity?"+p.Encode(), &out); err != nil {
		return nil, err
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
	ID              string    `json:"id"`
	IdempotencyKey  string    `json:"idempotency_key"`
	SenderID        string    `json:"sender_id"`
	RecipientID     string    `json:"recipient_id"`
	Amount          moneyResp `json:"amount"`
	Currency        string    `json:"currency"`
	Status          string    `json:"status"`
	Description     *string   `json:"description"`
	FailureReason   *string   `json:"failure_reason"`
	LedgerPostingID *string   `json:"ledger_posting_id"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
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

// ---------------------------------------------------------------------------
// Consumer pay links
// ---------------------------------------------------------------------------

var (
	ErrConsumerPayLinkNotFound  = errors.New("consumer pay link not found")
	ErrConsumerPayLinkNotActive = errors.New("consumer pay link is not active")
)

type ConsumerPayLink struct {
	ID                  string     `json:"id"`
	LinkCode            string     `json:"link_code"`
	ReceiverConsumerID  string     `json:"receiver_consumer_id"`
	ReceiverHandle      string     `json:"receiver_handle"`
	ReceiverDisplayName *string    `json:"receiver_display_name"`
	AmountMinor         *int64     `json:"amount_minor"`
	Note                *string    `json:"note"`
	Currency            string     `json:"currency"`
	Locked              bool       `json:"locked"`
	Status              string     `json:"status"`
	PayerConsumerID     *string    `json:"payer_consumer_id"`
	TransferID          *string    `json:"transfer_id"`
	ExpiresAt           *time.Time `json:"expires_at"`
	CreatedAt           time.Time  `json:"created_at"`
	PaidAt              *time.Time `json:"paid_at"`
}

type CreateConsumerPayLinkRequest struct {
	ReceiverConsumerID string  `json:"receiver_consumer_id"`
	AmountMinor        *int64  `json:"amount_minor,omitempty"`
	Note               *string `json:"note,omitempty"`
	Currency           string  `json:"currency"`
	Locked             bool    `json:"locked"`
	ExpiresInHours     *int64  `json:"expires_in_hours,omitempty"`
}

type PayConsumerPayLinkRequest struct {
	PayerConsumerID string `json:"payer_consumer_id"`
	AmountMinor     *int64 `json:"amount_minor,omitempty"`
	IdempotencyKey  string `json:"idempotency_key"`
}

func (c *CorePublicClient) CreateConsumerPayLink(ctx context.Context, req CreateConsumerPayLinkRequest) (*ConsumerPayLink, error) {
	var out ConsumerPayLink
	if err := c.post(ctx, "/internal/v1/consumer-pay-links", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *CorePublicClient) GetConsumerPayLinkByCode(ctx context.Context, code string) (*ConsumerPayLink, error) {
	var out ConsumerPayLink
	if err := c.get(ctx, "/internal/v1/consumer-pay-links/by-code/"+code, &out); err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrConsumerPayLinkNotFound
		}
		return nil, err
	}
	return &out, nil
}

func (c *CorePublicClient) PayConsumerPayLink(ctx context.Context, code string, req PayConsumerPayLinkRequest) (*ConsumerPayLink, error) {
	var out ConsumerPayLink
	if err := c.post(ctx, "/internal/v1/consumer-pay-links/"+code+"/pay", req, &out); err != nil {
		return nil, mapConsumerPayLinkPayError(err)
	}
	return &out, nil
}

func mapConsumerPayLinkPayError(err error) error {
	if errors.Is(err, ErrNotFound) {
		return ErrConsumerPayLinkNotFound
	}
	msg := err.Error()
	switch {
	case contains(msg, "LINK_NOT_ACTIVE") || contains(msg, "LINK_EXPIRED"):
		return ErrConsumerPayLinkNotActive
	case contains(msg, "INSUFFICIENT_FUNDS"):
		return ErrTransferInsufficientFunds
	case contains(msg, "WALLET_NOT_FOUND"):
		return ErrTransferWalletNotFound
	case contains(msg, "ACCOUNT_FROZEN"):
		return ErrTransferWalletLocked
	case contains(msg, "cannot pay your own link"):
		return ErrTransferSelfTransfer
	default:
		return err
	}
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
