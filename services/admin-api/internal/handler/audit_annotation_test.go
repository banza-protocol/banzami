package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/middleware"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// annSink captures audit rows written by the Audit middleware.
type annSink struct{ entries []service.AuditEntry }

func (s *annSink) Write(_ context.Context, e service.AuditEntry) { s.entries = append(s.entries, e) }

// auditedRoute wraps a handler with the real Audit middleware + a principal, so
// the test exercises the same annotation path production uses.
func auditedRoute(sink middleware.AuditWriter, method, pattern string, h http.HandlerFunc) http.Handler {
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := auth.WithPrincipal(req.Context(), auth.Principal{ID: "op1", Email: "op@b.co", Role: "SUPER_ADMIN"})
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	r.Use(middleware.Audit(sink))
	r.Method(method, pattern, h)
	return r
}

func snapshot(e service.AuditEntry) string {
	b, _ := json.Marshal(map[string]any{"before": e.Before, "after": e.After, "entity": e.EntityID})
	return string(b)
}

func assertNoSecret(t *testing.T, e service.AuditEntry) {
	t.Helper()
	blob := strings.ToLower(snapshot(e))
	for _, bad := range []string{"raw-secret", "activation_token", "token_hash", "password", "secret", "$2", "?sig="} {
		if strings.Contains(blob, bad) {
			t.Fatalf("audit snapshot leaked %q: %s", bad, snapshot(e))
		}
	}
}

func TestAudit_ApproveApplicationAnnotated(t *testing.T) {
	gw := &fakeGW{approval: service.ApprovalResult{
		MerchantID: "m1", Email: "lojista@x.co", BusinessName: "Loja", Handle: "loja_alex",
		ApiKeyPrefix: "bz_test_ab", ActivationToken: "RAW-SECRET-123",
	}}
	h := NewMerchantApplicationHandler(gw, &fakeMailer{}, "https://banzami.com")
	sink := &annSink{}
	w := httptest.NewRecorder()
	auditedRoute(sink, http.MethodPost, "/admin/v1/merchant-applications/{id}/approve", h.Approve).
		ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/admin/v1/merchant-applications/app-7/approve", strings.NewReader(`{}`)))

	if len(sink.entries) != 1 {
		t.Fatalf("approve must write one audit row, got %d", len(sink.entries))
	}
	e := sink.entries[0]
	if e.Action != "APPROVE_APPLICATION" || e.EntityType != "merchant_application" || e.EntityID != "app-7" {
		t.Fatalf("unexpected entity/action: %+v", e)
	}
	after, _ := e.After.(map[string]any)
	if after["status"] != "APPROVED" || after["merchant_id"] != "m1" {
		t.Fatalf("after payload missing status/merchant_id: %v", e.After)
	}
	assertNoSecret(t, e) // activation token must NOT be in the snapshot
}

func TestAudit_RejectKybAnnotated(t *testing.T) {
	gw := &fakeGW{}
	h := NewMerchantApplicationHandler(gw, &fakeMailer{}, "https://banzami.com")
	sink := &annSink{}
	w := httptest.NewRecorder()
	auditedRoute(sink, http.MethodPost, "/admin/v1/merchant-applications/{id}/documents/{documentId}/reject", h.RejectDocument).
		ServeHTTP(w, httptest.NewRequest(http.MethodPost,
			"/admin/v1/merchant-applications/app-7/documents/doc-3/reject", strings.NewReader(`{"reason":"blurry scan"}`)))

	if len(sink.entries) != 1 {
		t.Fatalf("reject KYB must write one audit row, got %d", len(sink.entries))
	}
	e := sink.entries[0]
	if e.EntityType != "kyb_document" || e.EntityID != "doc-3" {
		t.Fatalf("entity must be kyb_document/doc-3: %+v", e)
	}
	after, _ := e.After.(map[string]any)
	if after["document_id"] != "doc-3" || after["reason"] != "blurry scan" || after["status"] != "REJECTED" {
		t.Fatalf("after payload missing document_id/reason/status: %v", e.After)
	}
	assertNoSecret(t, e)
}

func TestAudit_AnnotationHelpersAreNoOpWithoutMiddleware(t *testing.T) {
	// Calling the helpers without a seeded annotation (no Audit middleware) must
	// not panic — handlers stay usable in isolation.
	r := httptest.NewRequest(http.MethodPost, "/x", nil)
	auditAfter(r, "wallet", "w1", map[string]any{"amount_minor": 100})
	auditChange(r, "admin_user", "u1", map[string]any{"a": 1}, map[string]any{"a": 2})
}
