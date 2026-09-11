package handler

import (
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/public-api/internal/service"
)

// A6-14 — the P2P push event is not a payment journal in the logs. It logged
// the recipient's consumer id, the sender's @handle and the amount for every
// payment; it now logs the event and the two ids, masked.
func TestPaymentReceivedLogAttrs_NoHandleNoAmountMaskedIDs(t *testing.T) {
	const consumerID = "5d0f6a2e-1b3c-4d5e-8f90-a1b2c3d4e5f6"
	const transferID = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d"
	attrs := paymentReceivedLogAttrs(consumerID, transferID)
	line := fmt.Sprint(attrs...)
	for _, leak := range []string{consumerID, transferID, "sender", "amount", "handle"} {
		if strings.Contains(line, leak) {
			t.Fatalf("payment-received log carries %q: %v", leak, attrs)
		}
	}
	got := map[string]any{}
	for i := 0; i+1 < len(attrs); i += 2 {
		got[attrs[i].(string)] = attrs[i+1]
	}
	if got["recipient_id"] != "5d0f6a2e…" || got["transfer_id"] != "9a8b7c6d…" || got["event"] != "payment_received" {
		t.Fatalf("payment-received log attrs = %v", got)
	}
}

// The lookup error quotes core's path, handle included: only its kind is logged.
func TestRecipientLookupFailure_NamesTheKindNotTheText(t *testing.T) {
	if got := recipientLookupFailure(service.ErrConsumerNotFound); got != "not_found" {
		t.Fatalf("not found → %q", got)
	}
	transport := errors.New(`core-api transport: Get "http://core/internal/v1/consumers/handle/maria_luanda": dial tcp: connection refused`)
	if got := recipientLookupFailure(transport); got != "lookup_failed" || strings.Contains(got, "maria") {
		t.Fatalf("transport → %q", got)
	}
}
