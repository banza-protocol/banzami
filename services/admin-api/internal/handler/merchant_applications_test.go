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
	approvedTo, approvedURL, approvedEnv string
	rejectedTo, rejectedMsg              string
	approvedCalled                       bool
	rejectedCalled                       bool
}

func (m *fakeMailer) MerchantApplicationApproved(to, _, _, environment, url string) {
	m.approvedCalled, m.approvedTo, m.approvedEnv, m.approvedURL = true, to, environment, url
}
func (m *fakeMailer) MerchantApplicationRejected(to, _, msg, _ string) {
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
	h := NewMerchantApplicationHandler(gw, mailer, "https://banzami.com", nil)

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
	h := NewMerchantApplicationHandler(&fakeGW{approveErr: errBoom}, &fakeMailer{}, "https://banzami.com", nil)
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
	}}, mailer, "https://banzami.com", nil)

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

// fakePlatform returns a fixed platform mode (or an error-style fallback).
type fakePlatform struct{ mode string }

func (p fakePlatform) GetMode(context.Context) service.PlatformMode {
	return service.PlatformMode{Mode: p.mode}
}

// The approval email's environment follows the GLOBAL Platform Status, never the
// application's own field. SANDBOX platform → email says SANDBOX (never "Produção");
// a nil/failed reader is fail-safe SANDBOX; LIVE → LIVE.
func TestApproveEmailEnvironmentFollowsPlatformStatus(t *testing.T) {
	cases := []struct {
		name     string
		platform PlatformModeReader
		want     string
	}{
		{"sandbox platform", fakePlatform{mode: "SANDBOX"}, "SANDBOX"},
		{"live platform", fakePlatform{mode: "LIVE"}, "LIVE"},
		{"unknown → sandbox fail-safe", fakePlatform{mode: ""}, "SANDBOX"},
		{"nil reader → sandbox fail-safe", nil, "SANDBOX"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// The application itself is LIVE — the email must still follow the platform.
			gw := &fakeGW{approval: service.ApprovalResult{
				Email: "x@y.co", BusinessName: "Loja", Handle: "loja", Environment: "LIVE", ActivationToken: "T",
			}}
			mailer := &fakeMailer{}
			h := NewMerchantApplicationHandler(gw, mailer, "https://banzami.com", c.platform)
			rec := httptest.NewRecorder()
			route(h).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/admin/v1/merchant-applications/app-1/approve", strings.NewReader(`{"reviewed_by":"a"}`)))
			if rec.Code != http.StatusOK {
				t.Fatalf("status=%d", rec.Code)
			}
			if mailer.approvedEnv != c.want {
				t.Fatalf("email env = %q, want %q (platform, not application LIVE)", mailer.approvedEnv, c.want)
			}
		})
	}
}
