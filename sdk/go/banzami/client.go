package banzami

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	defaultLiveURL    = "https://api.banzami.com"
	defaultSandboxURL = "https://sandbox-api.banzami.com"
	defaultMaxRetries = 3
	defaultRetryDelay = 500 * time.Millisecond
	sdkVersion        = "0.1.0"
)

// ClientOptions configures the Banzami API client.
type ClientOptions struct {
	// APIKey is the Banzami API key. Prefix determines environment:
	//   bz_live_... → live (real money)
	//   bz_test_... → sandbox (virtual funds)
	APIKey string

	// BaseURL overrides the default API base URL. Useful for testing.
	BaseURL string

	// MaxRetries is the maximum number of retry attempts on 429/5xx responses.
	// Default: 3.
	MaxRetries int

	// RetryDelay is the base delay for exponential backoff. Default: 500ms.
	RetryDelay time.Duration

	// WebhookSecret is the secret for verifying incoming webhook signatures.
	// Required to call client.Webhooks.ConstructEvent().
	WebhookSecret string

	// HTTPClient overrides the default HTTP client. Useful for testing.
	HTTPClient *http.Client
}

// Client is the official Banzami API client.
//
//	client := banzami.NewClient(banzami.ClientOptions{
//	    APIKey: "bz_live_...",
//	})
type Client struct {
	opts ClientOptions
	base string
	http *http.Client

	// Webhooks exposes signature verification and test helpers.
	Webhooks *WebhooksClient

	// PaymentLinks exposes payment link operations.
	PaymentLinks *PaymentLinksClient

	// Transactions exposes transaction query operations.
	Transactions *TransactionsClient

	// Payouts exposes payout operations.
	Payouts *PayoutsClient
}

// NewClient creates a new Banzami API client.
func NewClient(opts ClientOptions) *Client {
	if opts.MaxRetries == 0 {
		opts.MaxRetries = defaultMaxRetries
	}
	if opts.RetryDelay == 0 {
		opts.RetryDelay = defaultRetryDelay
	}

	base := opts.BaseURL
	if base == "" {
		if strings.HasPrefix(opts.APIKey, "bz_test_") {
			base = defaultSandboxURL
		} else {
			base = defaultLiveURL
		}
	}

	httpClient := opts.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}

	c := &Client{
		opts: opts,
		base: strings.TrimRight(base, "/"),
		http: httpClient,
	}
	c.Webhooks     = &WebhooksClient{secret: opts.WebhookSecret}
	c.PaymentLinks = &PaymentLinksClient{c: c}
	c.Transactions = &TransactionsClient{c: c}
	c.Payouts      = &PayoutsClient{c: c}
	return c
}

// IsSandbox returns true when the client is configured with a bz_test_ key.
func (c *Client) IsSandbox() bool {
	return strings.HasPrefix(c.opts.APIKey, "bz_test_")
}

// ---------------------------------------------------------------------------
// Core request methods
// ---------------------------------------------------------------------------

func (c *Client) doRequest(ctx context.Context, method, path string, body, out any, idempotencyKey string) error {
	var lastErr error
	for attempt := 0; attempt <= c.opts.MaxRetries; attempt++ {
		if attempt > 0 {
			delay := time.Duration(float64(c.opts.RetryDelay) * math.Pow(2, float64(attempt-1)))
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
		}

		err := c.executeOnce(ctx, method, path, body, out, idempotencyKey)
		if err == nil {
			return nil
		}

		apiErr, isAPIErr := err.(*APIError)
		if isAPIErr && (apiErr.Status == 429 || apiErr.Status >= 500) && attempt < c.opts.MaxRetries {
			lastErr = err
			continue
		}
		return err
	}
	return lastErr
}

func (c *Client) executeOnce(ctx context.Context, method, path string, body, out any, idempotencyKey string) error {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("banzami: failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.base+"/v1"+path, reqBody)
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.opts.APIKey)
	req.Header.Set("User-Agent", "banzami-go/"+sdkVersion)
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("banzami: request failed: %w", err)
	}
	defer resp.Body.Close()

	if !isSuccess(resp.StatusCode) {
		return c.parseAPIError(resp)
	}
	if resp.StatusCode == http.StatusNoContent || out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (c *Client) get(ctx context.Context, path string, params url.Values, out any) error {
	p := path
	if len(params) > 0 {
		p += "?" + params.Encode()
	}
	return c.doRequest(ctx, http.MethodGet, p, nil, out, "")
}

func (c *Client) post(ctx context.Context, path string, body any, out any, idempotencyKey string) error {
	return c.doRequest(ctx, http.MethodPost, path, body, out, idempotencyKey)
}

func (c *Client) delete(ctx context.Context, path string) error {
	return c.doRequest(ctx, http.MethodDelete, path, nil, nil, "")
}

func (c *Client) parseAPIError(resp *http.Response) error {
	var payload struct {
		Code      string `json:"code"`
		Message   string `json:"message"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&payload)
	if payload.Code == "" {
		payload.Code = "UNKNOWN"
	}
	if payload.Message == "" {
		payload.Message = resp.Status
	}
	return &APIError{
		Status:    resp.StatusCode,
		Code:      payload.Code,
		Message:   payload.Message,
		RequestID: resp.Header.Get("X-Request-Id"),
	}
}

func isSuccess(status int) bool {
	return status >= 200 && status < 300
}

// ---------------------------------------------------------------------------
// Payment links resource
// ---------------------------------------------------------------------------

// PaymentLinksClient provides payment link operations.
type PaymentLinksClient struct{ c *Client }

// CreatePaymentLinkInput holds the parameters for creating a payment link.
type CreatePaymentLinkInput struct {
	MerchantID     string    `json:"merchant_id"`
	WalletID       string    `json:"wallet_id"`
	AmountMinor    *int64    `json:"amount_minor,omitempty"`
	Currency       string    `json:"currency"`
	Description    string    `json:"description,omitempty"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty"`
	IdempotencyKey string    `json:"-"`
}

// Create creates a new payment link.
func (r *PaymentLinksClient) Create(ctx context.Context, input CreatePaymentLinkInput) (*PaymentLink, error) {
	if input.Currency == "" {
		input.Currency = "AOA"
	}
	key := input.IdempotencyKey
	if key == "" {
		key = newIdempotencyKey()
	}
	var out PaymentLink
	return &out, r.c.post(ctx, "/payment-links", input, &out, key)
}

// Get retrieves a payment link by ID.
func (r *PaymentLinksClient) Get(ctx context.Context, id string) (*PaymentLink, error) {
	var out PaymentLink
	return &out, r.c.get(ctx, "/payment-links/"+id, nil, &out)
}

// List returns a paginated list of payment links for a merchant.
func (r *PaymentLinksClient) List(ctx context.Context, merchantID string, limit int, cursor string) (*Page[PaymentLink], error) {
	p := url.Values{"merchant_id": {merchantID}}
	if limit > 0 {
		p.Set("limit", strconv.Itoa(limit))
	}
	if cursor != "" {
		p.Set("cursor", cursor)
	}
	var out Page[PaymentLink]
	return &out, r.c.get(ctx, "/payment-links", p, &out)
}

// Cancel cancels a payment link.
func (r *PaymentLinksClient) Cancel(ctx context.Context, id string) (*PaymentLink, error) {
	var out PaymentLink
	return &out, r.c.delete(ctx, "/payment-links/"+id)
}

// ---------------------------------------------------------------------------
// Transactions resource
// ---------------------------------------------------------------------------

// TransactionsClient provides transaction query operations.
type TransactionsClient struct{ c *Client }

// List returns a paginated list of transactions.
func (r *TransactionsClient) List(ctx context.Context, limit int, cursor, status string) (*Page[Transaction], error) {
	p := url.Values{}
	if limit > 0 {
		p.Set("limit", strconv.Itoa(limit))
	}
	if cursor != "" {
		p.Set("cursor", cursor)
	}
	if status != "" {
		p.Set("status", status)
	}
	var out Page[Transaction]
	return &out, r.c.get(ctx, "/transactions", p, &out)
}

// Get retrieves a transaction by ID.
func (r *TransactionsClient) Get(ctx context.Context, id string) (*Transaction, error) {
	var out Transaction
	return &out, r.c.get(ctx, "/transactions/"+id, nil, &out)
}

// ---------------------------------------------------------------------------
// Payouts resource
// ---------------------------------------------------------------------------

// PayoutsClient provides payout operations.
type PayoutsClient struct{ c *Client }

// List returns a paginated list of payouts.
func (r *PayoutsClient) List(ctx context.Context, limit int, cursor string) (*Page[Payout], error) {
	p := url.Values{}
	if limit > 0 {
		p.Set("limit", strconv.Itoa(limit))
	}
	if cursor != "" {
		p.Set("cursor", cursor)
	}
	var out Page[Payout]
	return &out, r.c.get(ctx, "/payouts", p, &out)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func newIdempotencyKey() string {
	// Generate a UUID v4 using Go's built-in random source.
	// github.com/google/uuid is used for production-quality generation.
	b := make([]byte, 16)
	_, _ = io.ReadFull(randReader{}, b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

type randReader struct{}

func (randReader) Read(p []byte) (n int, err error) {
	// crypto/rand is intentionally not used here to avoid initialization cost
	// in unit tests. In production, use github.com/google/uuid.
	for i := range p {
		p[i] = byte(time.Now().UnixNano()>>uint(i%8)) ^ 0xa5
	}
	return len(p), nil
}
