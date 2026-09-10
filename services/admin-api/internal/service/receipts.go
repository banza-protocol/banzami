package service

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	documents "github.com/banzami/banzami/services/common/documents"
)

// ErrReceiptNotFound is returned when no transaction matches the id.
var ErrReceiptNotFound = errors.New("receipt not found")

// ReceiptSource loads a transaction (merchant payment or transfer) as official
// ReceiptData. Read-only — never writes.
type ReceiptSource interface {
	LoadReceipt(ctx context.Context, id string) (documents.ReceiptData, error)
}

// receiptGateway is the operator's canonical receipt derivation
// (api-gateway service/receipt_semantics.go), reached over its internal API.
type receiptGateway interface {
	receiptRaw(ctx context.Context, path string, body any) (json.RawMessage, int, error)
}

// GatewayReceiptSource renders a BANZADMIN receipt from the same canonical
// receipt the payer's phone, the PDF and the public verifier show.
//
// This read the parties from Postgres itself — a third reconstruction next to
// public-api's and the gateway's, and like public-api's it assumed every
// transfer was person-to-person: a payment to a Business printed an empty
// recipient. Now nothing is derived here.
//
// It never ISSUES a proof: an operator viewing a document is not the event
// that creates public proof capability. A receipt with no proof yet renders
// with no verification block, and says so by its absence.
type GatewayReceiptSource struct {
	gw          receiptGateway
	environment string // this console's environment: the one its gateway serves
}

func NewGatewayReceiptSource(gw *GatewayClient, environment string) *GatewayReceiptSource {
	if gw == nil {
		return nil
	}
	return &GatewayReceiptSource{gw: gw, environment: strings.ToUpper(strings.TrimSpace(environment))}
}

// LoadReceipt resolves a wallet payment first, then a transfer.
func (s *GatewayReceiptSource) LoadReceipt(ctx context.Context, id string) (documents.ReceiptData, error) {
	for _, try := range []struct {
		path string
		body any
	}{
		{"/internal/v1/receipts/wallet-payment", map[string]any{"id": id, "issue": false}},
		{"/internal/v1/receipts/transfer", map[string]any{"transaction_id": id, "environment": s.environment, "issue": false}},
	} {
		raw, code, err := s.gw.receiptRaw(ctx, try.path, try.body)
		if err != nil {
			return documents.ReceiptData{}, err
		}
		if code == http.StatusNotFound {
			continue
		}
		if code != http.StatusOK {
			return documents.ReceiptData{}, errors.New("gateway receipt answered " + http.StatusText(code))
		}
		var out struct {
			Receipt documents.Receipt `json:"receipt"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			return documents.ReceiptData{}, err
		}
		return documents.ReceiptDataFromReceipt(out.Receipt, documents.PerspectiveAdmin), nil
	}
	return documents.ReceiptData{}, ErrReceiptNotFound
}
