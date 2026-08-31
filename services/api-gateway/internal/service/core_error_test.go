package service

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

// These tests exist because the previous behaviour could not distinguish a
// rejection from a failure. Every non-2xx became an untyped string, handlers
// defaulted to 502, and the deployed API answered 502 to an invalid amount and to
// a cross-merchant access refusal (RA-043).
//
// The property under test is that the three classes stay separate:
//   core 4xx  → a decision the caller can act on
//   core 5xx  → core failed
//   transport → the exchange never happened

func coreReturning(t *testing.T, status int, body string) *CoreApiClient {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return NewCoreApiClient(srv.URL, "")
}

func TestCoreError_ClientStatusesArePreserved(t *testing.T) {
	for _, tc := range []struct {
		status int
		code   string
	}{
		{http.StatusBadRequest, "INVALID_AMOUNT"},
		{http.StatusForbidden, "NOT_OWNER"},
		{http.StatusConflict, "WALLET_ACCOUNT_INACTIVE"},
		{http.StatusUnprocessableEntity, "UNPROCESSABLE"},
		{http.StatusTooManyRequests, "RATE_LIMITED"},
	} {
		c := coreReturning(t, tc.status, `{"error":{"code":"`+tc.code+`","message":"nope"}}`)
		err := c.post(context.Background(), "/internal/v1/anything", map[string]any{}, nil)
		if err == nil {
			t.Fatalf("status %d: expected an error", tc.status)
		}
		ce, ok := AsCoreError(err)
		if !ok {
			t.Fatalf("status %d: expected a *CoreError, got %T", tc.status, err)
		}
		if ce.Status != tc.status {
			t.Errorf("status = %d, want %d", ce.Status, tc.status)
		}
		if ce.Code != tc.code {
			t.Errorf("code = %q, want %q", ce.Code, tc.code)
		}
		if !ce.IsClientError() {
			t.Errorf("status %d must be classified as a client error", tc.status)
		}
		if got := PublicStatusFor(err); got != tc.status {
			t.Errorf("public status = %d, want %d — a core rejection must not become 502", got, tc.status)
		}
	}
}

// The regression that matters most: core 5xx must NOT be reported to the caller
// as if their request were at fault.
func TestCoreError_ServerErrorBecomes502(t *testing.T) {
	c := coreReturning(t, http.StatusInternalServerError, `{"error":{"code":"BOOM","message":"x"}}`)
	err := c.post(context.Background(), "/internal/v1/anything", map[string]any{}, nil)
	ce, ok := AsCoreError(err)
	if !ok {
		t.Fatalf("expected *CoreError, got %T", err)
	}
	if ce.IsClientError() {
		t.Error("500 must not be classified as a client error")
	}
	if got := PublicStatusFor(err); got != http.StatusBadGateway {
		t.Errorf("public status = %d, want 502", got)
	}
}

// Transport failure: core never formed an opinion, so the caller can learn
// nothing about their own request from it.
func TestCoreError_TransportFailureIs502AndNotACoreError(t *testing.T) {
	c := NewCoreApiClient("http://127.0.0.1:1", "")
	err := c.post(context.Background(), "/internal/v1/anything", map[string]any{}, nil)
	if err == nil {
		t.Fatal("expected a transport error")
	}
	if _, ok := AsCoreError(err); ok {
		t.Error("a transport failure must not masquerade as a core decision")
	}
	var te *TransportError
	if !errors.As(err, &te) {
		t.Errorf("expected *TransportError, got %T", err)
	}
	if got := PublicStatusFor(err); got != http.StatusBadGateway {
		t.Errorf("public status = %d, want 502", got)
	}
}

// 404 keeps its existing sentinel: ~38 call sites branch on it, and whether a
// route hides existence is that route's privacy decision.
func TestCoreError_NotFoundKeepsItsSentinel(t *testing.T) {
	c := coreReturning(t, http.StatusNotFound, `{"error":{"code":"NOT_FOUND","message":"x"}}`)
	err := c.post(context.Background(), "/internal/v1/anything", map[string]any{}, nil)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// A 4xx with no parsable envelope must still preserve its status rather than
// falling back to 502.
func TestCoreError_UnparsableBodyStillPreservesStatus(t *testing.T) {
	c := coreReturning(t, http.StatusBadRequest, `not json at all`)
	err := c.post(context.Background(), "/internal/v1/anything", map[string]any{}, nil)
	if got := PublicStatusFor(err); got != http.StatusBadRequest {
		t.Errorf("public status = %d, want 400", got)
	}
}
