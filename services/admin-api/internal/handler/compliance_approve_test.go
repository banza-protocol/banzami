package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// A5-06. An operator's compliance approval states its reason, like reject,
// suspend and flag always have. It is refused before core is ever called.
func TestApproveMerchant_RequiresAReason(t *testing.T) {
	h := NewComplianceHandler(nil) // a nil client: reaching core would panic
	r := chi.NewRouter()
	r.Post("/admin/v1/compliance/merchants/{id}/approve", h.ApproveMerchant)
	for _, body := range []string{``, `{}`, `{"notes":"   "}`} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/admin/v1/compliance/merchants/m1/approve", strings.NewReader(body)))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("approval with body %q answered %d, want 400", body, w.Code)
		}
	}
}
