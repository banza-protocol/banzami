package handler

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/banzami/banzami/services/public-api/internal/service"
)

type fakeMinter struct {
	ref   string
	err   error
	calls int
}

func (f *fakeMinter) EnsureReference(ctx context.Context, in service.ProofEnsureInput) (string, error) {
	f.calls++
	return f.ref, f.err
}

const secureRef = "BZM-ABCD-2345-6789-JKMN-PQRS-TVWX"

// A receipt may only be issued once its public proof durably exists.
func TestConsumerReceipt_IssuedWhenProofEstablished(t *testing.T) {
	m := &fakeMinter{ref: secureRef}
	h := &ReceiptHandler{core: &fakeReceiptCore{transfer: sampleTransfer(), consumers: sampleParties()},
		gen: stubGen(), proofs: m, env: "SANDBOX"}
	w, r := newReq(t, "s1")
	h.ConsumerReceipt(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%s)", w.Code, w.Body.String())
	}
	if m.calls != 1 {
		t.Fatalf("proof must be ensured exactly once, got %d", m.calls)
	}
}

// A transient proof failure means no PDF. The transfer stays complete; the user
// can ask again. Issuing a receipt that advertises verification it cannot deliver
// is the defect this replaces.
func TestConsumerReceipt_RefusedWhenProofFails(t *testing.T) {
	h := &ReceiptHandler{core: &fakeReceiptCore{transfer: sampleTransfer(), consumers: sampleParties()},
		gen: stubGen(), proofs: &fakeMinter{err: errors.New("gateway unreachable")}, env: "SANDBOX"}
	w, r := newReq(t, "s1")
	h.ConsumerReceipt(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
	if b := w.Body.String(); len(b) > 0 && b[0] == '%' {
		t.Fatal("a PDF was emitted despite the proof failing")
	}
}

// An empty reference is a failure even without an error.
func TestConsumerReceipt_RefusedOnEmptyReference(t *testing.T) {
	h := &ReceiptHandler{core: &fakeReceiptCore{transfer: sampleTransfer(), consumers: sampleParties()},
		gen: stubGen(), proofs: &fakeMinter{ref: ""}, env: "SANDBOX"}
	w, r := newReq(t, "s1")
	h.ConsumerReceipt(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
}

// Deterministic misconfiguration must refuse too — this is the deployed case,
// where the internal proof authority was never configured at all.
func TestConsumerReceipt_RefusedWhenProofClientMissing(t *testing.T) {
	h := &ReceiptHandler{core: &fakeReceiptCore{transfer: sampleTransfer(), consumers: sampleParties()},
		gen: stubGen(), proofs: nil, env: "SANDBOX"}
	w, r := newReq(t, "s1")
	h.ConsumerReceipt(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
}

// The trap that would have re-opened the hole: NewProofClient returns a nil
// *ProofClient when unconfigured, and a nil pointer in an interface is not nil.
// Without normalisation the required-dependency check passes and the handler
// dereferences its way back to unverifiable receipts.
func TestConsumerReceipt_TypedNilProofClientIsTreatedAsMissing(t *testing.T) {
	var unconfigured *service.ProofClient // exactly what NewProofClient returns
	h := NewReceiptHandler(&fakeReceiptCore{transfer: sampleTransfer(), consumers: sampleParties()},
		unconfigured, "SANDBOX")
	h.gen = stubGen() // never the real Chromium generator in a unit test
	if h.proofs != nil {
		t.Fatal("a nil *ProofClient must normalise to a nil ProofMinter")
	}
	w, r := newReq(t, "s1")
	h.ConsumerReceipt(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
}
