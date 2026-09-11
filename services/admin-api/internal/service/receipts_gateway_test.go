package service

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	documents "github.com/banzami/banzami/services/common/documents"
)

type fakeReceiptGW struct {
	calls []string
	byURL map[string]int
}

func (f *fakeReceiptGW) receiptRaw(_ context.Context, path string, body any) (json.RawMessage, int, error) {
	f.calls = append(f.calls, path)
	code := f.byURL[path]
	if code != http.StatusOK {
		return json.RawMessage(`{}`), code, nil
	}
	b := body.(map[string]any)
	if b["issue"] != false {
		panic("an operator's read must never issue a proof")
	}
	raw, _ := json.Marshal(map[string]any{"receipt": documents.Receipt{
		ProofReference: "BZM-Q7RT-CFAF-00ZT-ADSF-P4N7-FB0T", OperationKind: documents.OperationPayment,
		Payee: documents.Party{Kind: documents.PartyBusiness, DisplayName: "Doa", Handle: "doa"},
	}})
	return raw, http.StatusOK, nil
}

// BANZADMIN prints the canonical receipt — a transfer to a Business names the
// Business — and never issues a proof to do it.
func TestGatewayReceiptSource_TransferAfterWalletPayment(t *testing.T) {
	gw := &fakeReceiptGW{byURL: map[string]int{
		"/internal/v1/receipts/wallet-payment": http.StatusNotFound,
		"/internal/v1/receipts/transfer":       http.StatusOK,
	}}
	src := &GatewayReceiptSource{gw: gw, environment: "SANDBOX"}
	d, err := src.LoadReceipt(context.Background(), "0056ead5")
	if err != nil {
		t.Fatal(err)
	}
	if d.RecipientName != "@doa" || d.RecipientHandle != "" || d.Perspective != documents.PerspectiveAdmin || d.OperationKind != documents.OperationPayment {
		t.Fatalf("rendered %+v", d)
	}
	if len(gw.calls) != 2 {
		t.Fatalf("calls %v", gw.calls)
	}
}

func TestGatewayReceiptSource_NotFound(t *testing.T) {
	gw := &fakeReceiptGW{byURL: map[string]int{
		"/internal/v1/receipts/wallet-payment": http.StatusNotFound,
		"/internal/v1/receipts/transfer":       http.StatusNotFound,
	}}
	if _, err := (&GatewayReceiptSource{gw: gw, environment: "SANDBOX"}).LoadReceipt(context.Background(), "x"); err != ErrReceiptNotFound {
		t.Fatalf("err = %v", err)
	}
}
