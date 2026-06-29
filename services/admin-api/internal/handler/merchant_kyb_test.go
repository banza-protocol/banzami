package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// When the SANDBOX environment is requested but no staging gateway is configured,
// the merchant-KYB endpoints must respond 503 (never fall through to live).
func TestMerchantKyb_SandboxNotConfigured(t *testing.T) {
	h := NewMerchantKybHandler(nil, nil) // gwSandbox = nil

	for _, tc := range []struct{ name, method, path string }{
		{"list", http.MethodGet, "/admin/v1/merchant-kyb/documents?environment=SANDBOX"},
		{"approve", http.MethodPost, "/admin/v1/merchant-kyb/documents/x/approve?environment=SANDBOX"},
		{"reject", http.MethodPost, "/admin/v1/merchant-kyb/documents/x/reject?environment=SANDBOX"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req := httptest.NewRequest(tc.method, tc.path, http.NoBody)
			switch tc.name {
			case "list":
				h.List(w, req)
			case "approve":
				h.Approve(w, req)
			case "reject":
				h.Reject(w, req)
			}
			if w.Code != http.StatusServiceUnavailable {
				t.Fatalf("%s sandbox-not-configured: want 503, got %d", tc.name, w.Code)
			}
		})
	}
}

// read-url, context and timeline are forwarded verbatim to the gateway, and the
// access/decision is audited with the canonical action name. The signed URL the
// gateway returns must NEVER appear in the audit snapshot.
func TestMerchantKyb_ReadURL_AuditsAccessWithoutLeakingURL(t *testing.T) {
	const signed = "https://r2.example.com/obj?sig=DEADBEEF"
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Key") != "k" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"download_url":"` + signed + `"}`))
	}))
	defer up.Close()
	h := NewMerchantKybHandler(service.NewGatewayClient(up.URL, "k"), nil)

	for _, tc := range []struct{ intent, action string }{
		{"view", "VIEW_DOCUMENT"},
		{"download", "DOWNLOAD_DOCUMENT"},
		{"copy", "COPY_SIGNED_URL"},
		{"", "VIEW_DOCUMENT"},
	} {
		sink := &annSink{}
		w := httptest.NewRecorder()
		auditedRoute(sink, http.MethodPost, "/admin/v1/merchant-kyb/documents/{id}/read-url", h.ReadURL).
			ServeHTTP(w, httptest.NewRequest(http.MethodPost,
				"/admin/v1/merchant-kyb/documents/doc-9/read-url", strings.NewReader(`{"intent":"`+tc.intent+`"}`)))

		if w.Code != http.StatusOK {
			t.Fatalf("intent=%q: want 200, got %d", tc.intent, w.Code)
		}
		if !strings.Contains(w.Body.String(), signed) {
			t.Fatalf("intent=%q: signed url must be forwarded to the operator", tc.intent)
		}
		if len(sink.entries) != 1 {
			t.Fatalf("intent=%q: want one audit row, got %d", tc.intent, len(sink.entries))
		}
		e := sink.entries[0]
		if e.Action != tc.action || e.EntityType != "merchant_kyb_document" || e.EntityID != "doc-9" {
			t.Fatalf("intent=%q: unexpected audit entity/action: %+v", tc.intent, e)
		}
		assertNoSecret(t, e) // ?sig= signed URL must NOT be in the snapshot
	}
}

// approve forwards notes to the gateway but audits only decision + validity, and
// the gateway's status code is preserved.
func TestMerchantKyb_Approve_AuditsDecisionAndForwardsNotes(t *testing.T) {
	var gotBody string
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(b)
		gotBody = string(b)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"VALID"}`))
	}))
	defer up.Close()
	h := NewMerchantKybHandler(service.NewGatewayClient(up.URL, "k"), nil)

	sink := &annSink{}
	w := httptest.NewRecorder()
	auditedRoute(sink, http.MethodPost, "/admin/v1/merchant-kyb/documents/{id}/approve", h.Approve).
		ServeHTTP(w, httptest.NewRequest(http.MethodPost,
			"/admin/v1/merchant-kyb/documents/doc-1/approve",
			strings.NewReader(`{"valid_until":"2027-01-01T00:00:00Z","notes":"docs conferidos"}`)))

	if w.Code != http.StatusOK {
		t.Fatalf("approve: want 200, got %d", w.Code)
	}
	if !strings.Contains(gotBody, "docs conferidos") {
		t.Fatalf("notes must be forwarded to the gateway, body=%q", gotBody)
	}
	if len(sink.entries) != 1 {
		t.Fatalf("approve must write one audit row, got %d", len(sink.entries))
	}
	e := sink.entries[0]
	if e.Action != "APPROVE_DOCUMENT" || e.EntityID != "doc-1" {
		t.Fatalf("unexpected audit action/entity: %+v", e)
	}
	// Internal notes are operator-only and must not leak into the audit snapshot.
	if strings.Contains(snapshot(e), "docs conferidos") {
		t.Fatalf("internal notes leaked into audit snapshot: %s", snapshot(e))
	}
}
