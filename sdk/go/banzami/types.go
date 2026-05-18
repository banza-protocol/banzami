package banzami

import "time"

// Environment selects the data universe for all API calls.
// Live uses real money; Sandbox uses virtual, simulated funds.
type Environment string

const (
	EnvironmentLive    Environment = "live"
	EnvironmentSandbox Environment = "sandbox"
)

// Page is a cursor-paginated list response.
type Page[T any] struct {
	Data       []T    `json:"data"`
	NextCursor string `json:"next_cursor,omitempty"`
}

// ---------------------------------------------------------------------------
// Webhook types
// ---------------------------------------------------------------------------

// WebhookEventType is a canonical event type string dispatched by the Banzami
// api-gateway. Use WebhookEventType constants for exhaustive switch statements.
type WebhookEventType = string

const (
	EventPaymentLinkPaid    WebhookEventType = "payment_link.paid"
	EventTransactionCompleted WebhookEventType = "transaction.completed"
	EventTransactionFailed  WebhookEventType = "transaction.failed"
	EventPayoutCreated      WebhookEventType = "payout.created"
	EventPayoutCompleted    WebhookEventType = "payout.completed"
	EventPayoutFailed       WebhookEventType = "payout.failed"
)

// WebhookEndpointStatus is the lifecycle state of a webhook endpoint.
type WebhookEndpointStatus string

const (
	WebhookEndpointActive   WebhookEndpointStatus = "ACTIVE"
	WebhookEndpointDisabled WebhookEndpointStatus = "DISABLED"
)

// WebhookEndpoint is a registered webhook delivery target.
type WebhookEndpoint struct {
	ID        string                `json:"id"`
	URL       string                `json:"url"`
	Events    []string              `json:"events"`
	Status    WebhookEndpointStatus `json:"status"`
	CreatedAt time.Time             `json:"created_at"`
}

// WebhookEvent is a parsed and verified incoming webhook payload.
type WebhookEvent struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"`
	Data      map[string]any `json:"data"`
	CreatedAt time.Time      `json:"created_at"`
}

// ---------------------------------------------------------------------------
// Payment link types
// ---------------------------------------------------------------------------

// PaymentLinkStatus is the lifecycle state of a payment link.
type PaymentLinkStatus string

const (
	PaymentLinkActive    PaymentLinkStatus = "ACTIVE"
	PaymentLinkUsed      PaymentLinkStatus = "USED"
	PaymentLinkCancelled PaymentLinkStatus = "CANCELLED"
	PaymentLinkExpired   PaymentLinkStatus = "EXPIRED"
)

// PaymentLink is a shareable URL that a donor can pay with the Banzami app.
type PaymentLink struct {
	ID          string            `json:"id"`
	Slug        string            `json:"slug"`
	MerchantID  string            `json:"merchant_id"`
	WalletID    string            `json:"wallet_id"`
	AmountMinor *int64            `json:"amount_minor,omitempty"`
	Currency    string            `json:"currency"`
	Description string            `json:"description,omitempty"`
	Status      PaymentLinkStatus `json:"status"`
	ExpiresAt   *time.Time        `json:"expires_at,omitempty"`
	PaidAt      *time.Time        `json:"paid_at,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

// ---------------------------------------------------------------------------
// Transaction types
// ---------------------------------------------------------------------------

// TransactionStatus is the lifecycle state of a transaction.
type TransactionStatus string

const (
	TransactionPending   TransactionStatus = "PENDING"
	TransactionCompleted TransactionStatus = "COMPLETED"
	TransactionFailed    TransactionStatus = "FAILED"
	TransactionRefunded  TransactionStatus = "REFUNDED"
)

// Transaction is a merchant-facing record of a financial operation.
type Transaction struct {
	ID          string            `json:"id"`
	MerchantID  string            `json:"merchant_id"`
	AmountMinor int64             `json:"amount_minor"`
	Currency    string            `json:"currency"`
	Status      TransactionStatus `json:"status"`
	Description string            `json:"description,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

// ---------------------------------------------------------------------------
// Wallet types
// ---------------------------------------------------------------------------

// WalletBalance represents the current balance of a wallet.
type WalletBalance struct {
	AvailableMinor int64  `json:"available_minor"`
	ReservedMinor  int64  `json:"reserved_minor"`
	Currency       string `json:"currency"`
}

// ---------------------------------------------------------------------------
// Payout types
// ---------------------------------------------------------------------------

// PayoutStatus is the lifecycle state of a payout.
type PayoutStatus string

const (
	PayoutPending    PayoutStatus = "PENDING"
	PayoutProcessing PayoutStatus = "PROCESSING"
	PayoutCompleted  PayoutStatus = "COMPLETED"
	PayoutFailed     PayoutStatus = "FAILED"
)

// Payout is a disbursement from a merchant wallet to a bank account.
type Payout struct {
	ID          string       `json:"id"`
	WalletID    string       `json:"wallet_id"`
	AmountMinor int64        `json:"amount_minor"`
	Currency    string       `json:"currency"`
	Status      PayoutStatus `json:"status"`
	Reference   string       `json:"reference,omitempty"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}
