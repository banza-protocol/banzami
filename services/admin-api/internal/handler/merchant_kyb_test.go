package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
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
