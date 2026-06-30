package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/banzami/banzami/services/common/obs"
	"time"
)

// ProofEnsureInput mirrors the gateway's internal ensure-proof contract. public-api
// fills it from a canonical transfer so the gateway can mint the verifiable proof.
type ProofEnsureInput struct {
	TransactionID    string     `json:"transaction_id"`
	TransferID       string     `json:"transfer_id,omitempty"`
	Environment      string     `json:"environment"`
	PayerSubjectType string     `json:"payer_subject_type,omitempty"`
	PayerSubjectID   string     `json:"payer_subject_id,omitempty"`
	PayerDisplayName string     `json:"payer_display_name,omitempty"`
	PayerHandle      string     `json:"payer_handle,omitempty"`
	PayeeSubjectType string     `json:"payee_subject_type,omitempty"`
	PayeeSubjectID   string     `json:"payee_subject_id,omitempty"`
	PayeeDisplayName string     `json:"payee_display_name,omitempty"`
	PayeeHandle      string     `json:"payee_handle,omitempty"`
	AmountMinor      int64      `json:"amount_minor"`
	Currency         string     `json:"currency"`
	Status           string     `json:"status"`
	Description      string     `json:"description,omitempty"`
	Method           string     `json:"method,omitempty"`
	LedgerReference  string     `json:"ledger_reference,omitempty"`
	ConfirmedAt      *time.Time `json:"confirmed_at,omitempty"`
}

// ProofClient asks the gateway to idempotently mint a transaction proof. The
// gateway owns the signing key, so public-api never duplicates proof generation.
type ProofClient struct {
	baseURL     string
	internalKey string
	http        *http.Client
}

// NewProofClient returns nil when the gateway internal URL/key are not configured,
// so callers can fall back to a derived reference without a hard dependency.
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

// EnsureReference returns the proof's public reference (BZM-XXXX-XXXX). A nil
// client or any error yields "" so the receipt falls back to its derived ref.
func (c *ProofClient) EnsureReference(ctx context.Context, in ProofEnsureInput) (string, error) {
	if c == nil {
		return "", errors.New("proof client not configured")
	}
	body, _ := json.Marshal(in)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/v1/proofs/ensure", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", c.internalKey)
	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", errors.New("gateway ensure-proof returned " + resp.Status)
	}
	var out struct {
		ProofReference string `json:"proof_reference"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	return out.ProofReference, nil
}
