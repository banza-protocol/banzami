package service

import (
	"errors"
	"net/http"
	"testing"
)

func TestParseCoreError_ExtractsEnvelope(t *testing.T) {
	ce := parseCoreError(http.StatusConflict, []byte(`{"error":{"code":"INVALID_STATUS","message":"bad transition"}}`))
	if ce.Status != 409 || ce.Code != "INVALID_STATUS" || ce.Message != "bad transition" {
		t.Fatalf("unexpected: %+v", ce)
	}
}

func TestParseCoreError_DefaultsByStatus(t *testing.T) {
	cases := map[int]string{
		400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND",
		409: "CONFLICT", 422: "UNPROCESSABLE_ENTITY", 429: "RATE_LIMITED", 503: "UPSTREAM_ERROR",
	}
	for status, code := range cases {
		ce := parseCoreError(status, []byte(`not json`))
		if ce.Code != code {
			t.Fatalf("status %d: got code %q want %q", status, ce.Code, code)
		}
		if ce.Message != "not json" { // falls back to the raw body
			t.Fatalf("status %d: message not preserved: %q", status, ce.Message)
		}
	}
}

func TestParseCoreError_EmptyBodyUsesStatusText(t *testing.T) {
	ce := parseCoreError(http.StatusBadRequest, []byte(""))
	if ce.Message != http.StatusText(http.StatusBadRequest) {
		t.Fatalf("empty body should fall back to status text, got %q", ce.Message)
	}
}

func TestCoreError_IsNotFoundCompat(t *testing.T) {
	nf := parseCoreError(http.StatusNotFound, []byte(`{}`))
	if !errors.Is(nf, ErrNotFound) {
		t.Fatal("404 CoreError must satisfy errors.Is(ErrNotFound) for existing handlers")
	}
	other := parseCoreError(http.StatusConflict, []byte(`{}`))
	if errors.Is(other, ErrNotFound) {
		t.Fatal("non-404 CoreError must NOT match ErrNotFound")
	}
}
