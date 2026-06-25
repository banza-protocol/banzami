package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type fakeAppAdmin struct {
	apps       []service.MerchantApplication
	approval   service.ApprovalResult
	rejection  service.RejectionResult
	getErr     error
	approveErr error
	rejectErr  error
}

func (f *fakeAppAdmin) List(_ context.Context, _, _ string) ([]service.MerchantApplication, error) {
	return f.apps, nil
}
func (f *fakeAppAdmin) Get(_ context.Context, _ string) (service.MerchantApplication, error) {
	if f.getErr != nil {
		return service.MerchantApplication{}, f.getErr
	}
	return service.MerchantApplication{ID: "app-1", Status: "SUBMITTED"}, nil
}
func (f *fakeAppAdmin) Approve(_ context.Context, _, _ string, _ time.Duration) (service.ApprovalResult, error) {
	return f.approval, f.approveErr
}
func (f *fakeAppAdmin) Reject(_ context.Context, _, _, _, _ string) (service.RejectionResult, error) {
	return f.rejection, f.rejectErr
}

// route wires chi so {id} is parsed.
func appAdminRoute(h *MerchantApplicationAdminHandler, method, path string, fn http.HandlerFunc, body string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	r.MethodFunc(method, "/internal/v1/merchant-applications/{id}/approve", h.Approve)
	r.MethodFunc(method, "/internal/v1/merchant-applications/{id}/reject", h.Reject)
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestApplicationAdminApprove(t *testing.T) {
	t.Run("approve returns activation token once", func(t *testing.T) {
		h := NewMerchantApplicationAdminHandler(&fakeAppAdmin{approval: service.ApprovalResult{
			ApplicationID: "app-1", MerchantID: "m-1", ActivationToken: "raw-token", Handle: "cantina_alex",
		}})
		rec := appAdminRoute(h, http.MethodPost, "/internal/v1/merchant-applications/app-1/approve", h.Approve, `{"reviewed_by":"admin@x"}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("status=%d want 200", rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "raw-token") {
			t.Errorf("approval must return the activation token to admin-api")
		}
	})

	t.Run("not open → 409", func(t *testing.T) {
		h := NewMerchantApplicationAdminHandler(&fakeAppAdmin{approveErr: service.ErrApplicationNotOpen})
		rec := appAdminRoute(h, http.MethodPost, "/internal/v1/merchant-applications/app-1/approve", h.Approve, `{}`)
		if rec.Code != http.StatusConflict {
			t.Fatalf("status=%d want 409", rec.Code)
		}
	})

	t.Run("not found → 404", func(t *testing.T) {
		h := NewMerchantApplicationAdminHandler(&fakeAppAdmin{approveErr: service.ErrApplicationNotFound})
		rec := appAdminRoute(h, http.MethodPost, "/internal/v1/merchant-applications/x/approve", h.Approve, `{}`)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("status=%d want 404", rec.Code)
		}
	})

	t.Run("unavailable service → 503", func(t *testing.T) {
		h := NewMerchantApplicationAdminHandler(nil)
		rec := appAdminRoute(h, http.MethodPost, "/internal/v1/merchant-applications/app-1/approve", h.Approve, `{}`)
		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("status=%d want 503", rec.Code)
		}
	})
}

func TestApplicationAdminReject(t *testing.T) {
	h := NewMerchantApplicationAdminHandler(&fakeAppAdmin{rejection: service.RejectionResult{ApplicationID: "app-1"}})
	rec := appAdminRoute(h, http.MethodPost, "/internal/v1/merchant-applications/app-1/reject", h.Reject, `{"reviewed_by":"admin@x","merchant_message":"falta NIF"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d want 200", rec.Code)
	}

	h2 := NewMerchantApplicationAdminHandler(&fakeAppAdmin{rejectErr: service.ErrApplicationNotOpen})
	rec2 := appAdminRoute(h2, http.MethodPost, "/internal/v1/merchant-applications/app-1/reject", h2.Reject, `{}`)
	if rec2.Code != http.StatusConflict {
		t.Fatalf("status=%d want 409", rec2.Code)
	}
}
