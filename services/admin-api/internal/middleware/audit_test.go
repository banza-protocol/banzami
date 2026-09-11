package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type fakeAudit struct{ entries []service.AuditEntry }

func (f *fakeAudit) Write(_ context.Context, e service.AuditEntry) { f.entries = append(f.entries, e) }

func auditRouter(sink AuditWriter) http.Handler {
	r := chi.NewRouter()
	// Stand in for AdminJWT: attach a principal so the audit row has an actor.
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := auth.WithPrincipal(req.Context(), auth.Principal{ID: "u1", Email: "op@banzami.com", Role: "SUPER_ADMIN", FullName: "Op"})
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	r.Use(Audit(sink))
	r.Post("/admin/v1/operators/{id}/suspend", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	r.Get("/admin/v1/operators", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	return r
}

func TestAudit_RecordsMutation(t *testing.T) {
	sink := &fakeAudit{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/admin/v1/operators/abc-123/suspend", nil)
	// The client as the server's clientip middleware resolved it. A header the
	// caller wrote is not the audited address (A9-09).
	r.RemoteAddr = "8.8.8.8"
	r.Header.Set("X-Real-IP", "6.6.6.6")
	r.Header.Set("X-Forwarded-For", "6.6.6.6")
	auditRouter(sink).ServeHTTP(w, r)

	if len(sink.entries) != 1 {
		t.Fatalf("expected exactly one audit row, got %d", len(sink.entries))
	}
	e := sink.entries[0]
	if e.Action != "SUSPEND_OPERATOR" {
		t.Errorf("action = %q, want SUSPEND_OPERATOR", e.Action)
	}
	if e.EntityType != "operators" || e.EntityID != "abc-123" {
		t.Errorf("entity = %s/%s, want operators/abc-123", e.EntityType, e.EntityID)
	}
	if e.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", e.StatusCode)
	}
	if e.AdminUserID != "u1" || e.Role != "SUPER_ADMIN" {
		t.Errorf("actor not captured: %+v", e)
	}
	if e.IP != "8.8.8.8" {
		t.Errorf("ip = %q, want 8.8.8.8", e.IP)
	}
}

func TestAudit_SkipsReads(t *testing.T) {
	sink := &fakeAudit{}
	w := httptest.NewRecorder()
	auditRouter(sink).ServeHTTP(w, httptest.NewRequest("GET", "/admin/v1/operators", nil))
	if len(sink.entries) != 0 {
		t.Fatalf("GET must not be audited, got %d rows", len(sink.entries))
	}
}
