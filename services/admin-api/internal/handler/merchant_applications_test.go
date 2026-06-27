package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type fakeGW struct {
	approval   service.ApprovalResult
	rejection  service.RejectionResult
	approveErr error
}

func (f *fakeGW) ListApplicationsRaw(_ context.Context, _, _ string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"applications":[]}`), 200, nil
}
func (f *fakeGW) GetApplicationRaw(_ context.Context, _ string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"id":"app-1"}`), 200, nil
}
func (f *fakeGW) ApproveApplication(_ context.Context, _, _ string) (service.ApprovalResult, int, error) {
	if f.approveErr != nil {
		return service.ApprovalResult{}, 409, f.approveErr
	}
	return f.approval, 200, nil
}
func (f *fakeGW) RejectApplication(_ context.Context, _, _, _, _ string) (service.RejectionResult, int, error) {
	return f.rejection, 200, nil
}

func (f *fakeGW) ListApplicationDocumentsRaw(_ context.Context, _ string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"data":[]}`), 200, nil
}
func (f *fakeGW) CreateDocumentReadURLRaw(_ context.Context, _, _ string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"read_url":"https://fake/key?sig=read"}`), 200, nil
}
func (f *fakeGW) AcceptDocumentRaw(_ context.Context, _, _, _ string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"status":"ACCEPTED"}`), 200, nil
}
func (f *fakeGW) RejectDocumentRaw(_ context.Context, _, _, _, _ string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"status":"REJECTED"}`), 200, nil
}

type fakeMailer struct {
	approvedTo, approvedURL string
	rejectedTo, rejectedMsg string
	approvedCalled          bool
	rejectedCalled          bool
}

func (m *fakeMailer) MerchantApplicationApproved(to, _, _, _, url string) {
	m.approvedCalled, m.approvedTo, m.approvedURL = true, to, url
}
func (m *fakeMailer) MerchantApplicationRejected(to, _, msg string) {
	m.rejectedCalled, m.rejectedTo, m.rejectedMsg = true, to, msg
}

func route(h *MerchantApplicationHandler) *chi.Mux {
	r := chi.NewRouter()
	r.Post("/admin/v1/merchant-applications/{id}/approve", h.Approve)
	r.Post("/admin/v1/merchant-applications/{id}/reject", h.Reject)
	return r
}

func TestApproveEmailsActivationLinkAndHidesToken(t *testing.T) {
	gw := &fakeGW{approval: service.ApprovalResult{
		MerchantID: "m1", Email: "lojista@x.co", BusinessName: "Loja",
		Handle: "loja_alex", ApiKeyPrefix: "bz_test_ab", ActivationToken: "RAW-SECRET-123",
	}}
	mailer := &fakeMailer{}
	h := NewMerchantApplicationHandler(gw, mailer, "https://banzami.com")

	req := httptest.NewRequest(http.MethodPost, "/admin/v1/merchant-applications/app-1/approve", strings.NewReader(`{"reviewed_by":"admin@x"}`))
	rec := httptest.NewRecorder()
	route(h).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d want 200", rec.Code)
	}
	// The raw activation token must NEVER reach the admin UI response.
	if strings.Contains(rec.Body.String(), "RAW-SECRET-123") {
		t.Errorf("response leaked the activation token: %s", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "APPROVED") || !strings.Contains(rec.Body.String(), "m1") {
		t.Errorf("unexpected response: %s", rec.Body.String())
	}
	// The email got the activation link WITH the token.
	if !mailer.approvedCalled || mailer.approvedTo != "lojista@x.co" {
		t.Fatalf("approved email not sent to applicant: %+v", mailer)
	}
	if !strings.Contains(mailer.approvedURL, "/comerciantes/activar?token=RAW-SECRET-123") {
		t.Errorf("activation URL wrong: %s", mailer.approvedURL)
	}
}

func TestApproveGatewayErrorPropagates(t *testing.T) {
	h := NewMerchantApplicationHandler(&fakeGW{approveErr: errBoom}, &fakeMailer{}, "https://banzami.com")
	req := httptest.NewRequest(http.MethodPost, "/admin/v1/merchant-applications/app-1/approve", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	route(h).ServeHTTP(rec, req)
	if rec.Code != 409 {
		t.Fatalf("status=%d want 409 (gateway code propagated)", rec.Code)
	}
}

func TestRejectEmailsApplicant(t *testing.T) {
	mailer := &fakeMailer{}
	h := NewMerchantApplicationHandler(&fakeGW{rejection: service.RejectionResult{
		Email: "r@x.co", BusinessName: "Loja", MerchantMessage: "Falta NIF",
	}}, mailer, "https://banzami.com")

	req := httptest.NewRequest(http.MethodPost, "/admin/v1/merchant-applications/app-1/reject", strings.NewReader(`{"merchant_message":"Falta NIF"}`))
	rec := httptest.NewRecorder()
	route(h).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d want 200", rec.Code)
	}
	if !mailer.rejectedCalled || mailer.rejectedTo != "r@x.co" || mailer.rejectedMsg != "Falta NIF" {
		t.Fatalf("rejected email not sent correctly: %+v", mailer)
	}
}

var errBoom = &boomErr{}

type boomErr struct{}

func (*boomErr) Error() string { return "boom" }
