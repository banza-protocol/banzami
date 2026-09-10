package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"time"

	documents "github.com/banzami/banzami/services/common/documents"
	"github.com/banzami/banzami/services/common/obs"
)

// ProofClient asks the gateway to idempotently mint a transaction proof. The
// gateway owns the signing key, so public-api never duplicates proof generation.
type ProofClient struct {
	baseURL     string
	internalKey string
	http        *http.Client
}

// NewProofClient returns nil when the gateway internal URL/key are not configured;
// receipts then refuse (RECEIPT_UNAVAILABLE) rather than invent a reference.
func NewProofClient(baseURL, internalKey string) *ProofClient {
	if baseURL == "" || internalKey == "" {
		return nil
	}
	return &ProofClient{
		baseURL:     baseURL,
		internalKey: internalKey,
		http:        &http.Client{Timeout: 8 * time.Second, Transport: obs.NewPropagationTransport(nil)},
	}
}

// ErrReceiptNotFound: the gateway knows no such transfer in this environment.
var ErrReceiptNotFound = errors.New("receipt source not found")

// TransferReceipt asks the gateway for the canonical receipt of a transfer —
// who paid whom, what the operation was, and its proof reference. public-api
// never assembles parties itself: the gateway derives them from the ledger's
// records (api-gateway service/receipt_semantics.go). issue establishes the
// proof; a nil client or any failure is an error and no receipt is issued
// (there is no fallback reference).
func (c *ProofClient) TransferReceipt(ctx context.Context, transactionID, environment string, issue bool) (documents.Receipt, error) {
	if c == nil {
		return documents.Receipt{}, errors.New("proof client not configured")
	}
	body, _ := json.Marshal(map[string]any{"transaction_id": transactionID, "environment": environment, "issue": issue})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/v1/receipts/transfer", bytes.NewReader(body))
	if err != nil {
		return documents.Receipt{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", c.internalKey)
	resp, err := c.http.Do(req)
	if err != nil {
		return documents.Receipt{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return documents.Receipt{}, ErrReceiptNotFound
	}
	if resp.StatusCode != http.StatusOK {
		return documents.Receipt{}, errors.New("gateway receipt returned " + resp.Status)
	}
	var out struct {
		Receipt documents.Receipt `json:"receipt"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return documents.Receipt{}, err
	}
	return out.Receipt, nil
}

// BusinessIdentity is a Business as every receipt names it: its public name
// and the @handle it owns.
type BusinessIdentity struct {
	DisplayName string `json:"display_name"`
	Handle      string `json:"handle"`
}

// BusinessIdentity reads a Business's public identity from the gateway.
func (c *ProofClient) BusinessIdentity(ctx context.Context, merchantID string) (BusinessIdentity, error) {
	if c == nil {
		return BusinessIdentity{}, errors.New("proof client not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/internal/v1/businesses/"+url.PathEscape(merchantID)+"/public-identity", nil)
	if err != nil {
		return BusinessIdentity{}, err
	}
	req.Header.Set("X-Internal-Key", c.internalKey)
	resp, err := c.http.Do(req)
	if err != nil {
		return BusinessIdentity{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return BusinessIdentity{}, errors.New("gateway business identity returned " + resp.Status)
	}
	var b BusinessIdentity
	if err := json.NewDecoder(resp.Body).Decode(&b); err != nil {
		return BusinessIdentity{}, err
	}
	return b, nil
}
