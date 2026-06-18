package handler_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/handler"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
)

// SBX-001 — sandbox isolation: a LIVE principal must be rejected on sandbox
// endpoints (403 SANDBOX_ONLY); a SANDBOX principal is allowed through.

func sandboxReq(env string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/v1/sandbox/status", nil)
	p := &middleware.Principal{MerchantID: "merchant-1", Environment: env}
	return r.WithContext(middleware.ContextWithPrincipal(r.Context(), p))
}

func TestSandbox_LiveKeyRejected(t *testing.T) {
	h := handler.NewSandboxHandler(nil, nil)
	w := httptest.NewRecorder()
	h.Status(w, sandboxReq("LIVE"))

	if w.Code != http.StatusForbidden {
		t.Fatalf("a LIVE key must be rejected on sandbox endpoints, got %d", w.Code)
	}
	if code := decodeError(t, w.Body).Code; code != "SANDBOX_ONLY" {
		t.Errorf("expected SANDBOX_ONLY, got %s", code)
	}
}

func TestSandbox_SandboxKeyAllowed(t *testing.T) {
	h := handler.NewSandboxHandler(nil, nil)
	w := httptest.NewRecorder()
	h.Status(w, sandboxReq("SANDBOX"))

	if w.Code != http.StatusOK {
		t.Fatalf("a SANDBOX key must be allowed, got %d", w.Code)
	}
}
