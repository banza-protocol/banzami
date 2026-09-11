package handler

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/middleware"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// The close route reaches Core with the reason and the operator, forwards Core's
// refusal as it is, and is SUPER_ADMIN only.
func TestWalletAccountClose(t *testing.T) {
	var got map[string]any
	status, answer := 200, `{"id":"wa-1","status":"CLOSED"}`
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &got)
		if r.URL.Path != "/internal/v1/wallet-accounts/wa-1/close" {
			t.Errorf("path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(answer))
	}))
	defer core.Close()
	h := NewWalletAccountHandler(service.NewCoreAdminClient(core.URL))
	r := chi.NewRouter()
	r.With(middleware.RequireCapability(auth.CapWalletAccountClose)).Post("/admin/v1/wallet-accounts/{id}/close", h.Close)
	call := func(role, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", "/admin/v1/wallet-accounts/wa-1/close", strings.NewReader(body))
		req = req.WithContext(auth.WithPrincipal(context.Background(), auth.Principal{ID: "op-7", Email: "op7@banzami.test", Role: role}))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	if w := call("SUPER_ADMIN", `{"reason":"synthetic fixture"}`); w.Code != 200 || got["reason"] != "synthetic fixture" || got["closed_by"] != "op7@banzami.test" {
		t.Fatalf("close: %d %s %v", w.Code, w.Body.String(), got)
	}
	if w := call("SUPER_ADMIN", `{"reason":"  "}`); w.Code != 400 {
		t.Fatalf("empty reason: %d", w.Code)
	}
	for _, role := range []string{"OPERATIONS", "COMPLIANCE", "SUPPORT", "READ_ONLY"} {
		if w := call(role, `{"reason":"x"}`); w.Code != 403 {
			t.Fatalf("%s: %d, want 403", role, w.Code)
		}
	}
	status, answer = 409, `{"error":{"code":"BALANCE_NOT_ZERO","message":"the account holds money"}}`
	if w := call("SUPER_ADMIN", `{"reason":"x"}`); w.Code != 409 || !strings.Contains(w.Body.String(), "BALANCE_NOT_ZERO") {
		t.Fatalf("refusal: %d %s", w.Code, w.Body.String())
	}
}
