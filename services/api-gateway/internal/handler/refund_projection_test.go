package handler

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// A refund is addressed by its public typed source; the payer's internal
// consumer id, the acquiring transaction id and the wallet id are not the
// caller's to hold (a Project key received all three).
func TestRefundResponse_CarriesNoPayerOrInternalIds(t *testing.T) {
	c, tx := "CONSUMERID", "TXID"
	r := &service.Refund{ID: "r1", SourceType: "WALLET_PAYMENT", SourceID: "wp1", ConsumerID: &c, TransactionID: &tx, WalletID: "WALLETID", AmountMinor: 100, Currency: "AOA", Status: "SUCCEEDED"}
	publicizeRefund(r)
	b, _ := json.Marshal(r)
	for _, leak := range []string{"CONSUMERID", "TXID", "WALLETID", "consumer_id", "transaction_id", "wallet_id"} {
		if strings.Contains(string(b), leak) {
			t.Fatalf("a refund response carries %s: %s", leak, b)
		}
	}
	if !strings.Contains(string(b), `"source_id":"wp1"`) {
		t.Fatalf("the refund lost its public source: %s", b)
	}
}
