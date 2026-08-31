package service

import (
	"errors"
	"net/http"
	"testing"
)

// Core answers 422 LINK_NOT_ACTIVE for an invalid state transition. That was
// never mapped to the sentinel the handler branches on, so cancelling an
// already-cancelled link fell through to a 500 — an invalid transition reported
// as a server fault, with the correct 422 branch sitting unused right beside it.
func TestMapPaymentLinkCoreError_NotActiveBecomesSentinel(t *testing.T) {
	err := mapPaymentLinkCoreError(&CoreError{Status: http.StatusUnprocessableEntity, Code: "LINK_NOT_ACTIVE", Message: "not active"})
	if !errors.Is(err, ErrPaymentLinkNotActive) {
		t.Fatalf("expected ErrPaymentLinkNotActive, got %v", err)
	}
}

func TestMapPaymentLinkCoreError_NotFoundBecomesSentinel(t *testing.T) {
	if err := mapPaymentLinkCoreError(ErrNotFound); !errors.Is(err, ErrPaymentLinkNotFound) {
		t.Fatalf("expected ErrPaymentLinkNotFound, got %v", err)
	}
}

// An unrelated core rejection must NOT be laundered into a state-transition
// error: it keeps its own identity so the status mapping stays truthful.
func TestMapPaymentLinkCoreError_OtherErrorsPassThrough(t *testing.T) {
	in := &CoreError{Status: http.StatusBadRequest, Code: "INVALID_AMOUNT"}
	out := mapPaymentLinkCoreError(in)
	if errors.Is(out, ErrPaymentLinkNotActive) || errors.Is(out, ErrPaymentLinkNotFound) {
		t.Fatal("an unrelated core error must not be converted into a link-state sentinel")
	}
	ce, ok := AsCoreError(out)
	if !ok || ce.Status != http.StatusBadRequest {
		t.Fatalf("expected the original CoreError to survive, got %v", out)
	}
}
