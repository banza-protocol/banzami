package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// disputes.resolved_by is the operator's admin user id (UUID). admin-api sent
// the e-mail, core refused to parse it, and no dispute could be resolved.
func TestDisputeResolve_SendsTheOperatorID(t *testing.T) {
	var got map[string]any
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &got)
		_, _ = w.Write([]byte(`{"id":"d1","status":"WON_BY_MERCHANT"}`))
	}))
	defer core.Close()
	h := NewDisputeHandler(service.NewCoreAdminClient(core.URL), nil, "SANDBOX")
	rt := chi.NewRouter()
	rt.Post("/admin/v1/disputes/{id}/resolve", h.Resolve)

	send := func(outcome string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/admin/v1/disputes/d1/resolve",
			strings.NewReader(`{"outcome":"`+outcome+`","resolution_notes":"n"}`))
		req = req.WithContext(auth.WithPrincipal(req.Context(), auth.Principal{
			ID: "5eed0a11-0000-4000-8000-0000000000aa", Email: "op@banzami.test", Role: "SUPER_ADMIN",
		}))
		w := httptest.NewRecorder()
		rt.ServeHTTP(w, req)
		return w
	}
	if w := send("WON_BY_MERCHANT"); w.Code != http.StatusOK {
		t.Fatalf("resolve: %d %s", w.Code, w.Body.String())
	}
	if got["resolved_by"] != "5eed0a11-0000-4000-8000-0000000000aa" {
		t.Fatalf("core received resolved_by=%v, want the operator's admin user id", got["resolved_by"])
	}
	for _, bad := range []string{"MERCHANT_FAVOR", "CONSUMER_FAVOR", ""} {
		if w := send(bad); w.Code != http.StatusBadRequest {
			t.Errorf("outcome %q: got %d, want 400", bad, w.Code)
		}
	}
}
