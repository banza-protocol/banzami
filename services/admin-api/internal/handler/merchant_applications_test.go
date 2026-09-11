package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type fakeGW struct {
	infoMessage string
	approval    service.ApprovalResult
	rejection   service.RejectionResult
	approveErr  error
	notFound    bool // when set, id-keyed ops return 404 (application lives in the other stack)
	linkCalls   int
	lastLink    [3]string
	// Business state + PIN reset.
	businessHandle string
	pinResets      int
}

func (f *fakeGW) ListApplicationsRaw(_ context.Context, _, _ string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"applications":[]}`), 200, nil
}
func (f *fakeGW) GetApplicationRaw(_ context.Context, _ string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"id":"app-1"}`), 200, nil
}
func (f *fakeGW) ApproveApplication(_ context.Context, _, _ string) (service.ApprovalResult, int, error) {
	if f.notFound {
		return service.ApprovalResult{}, http.StatusNotFound, errBoom
	}
	if f.approveErr != nil {
		return service.ApprovalResult{}, 409, f.approveErr
	}
	return f.approval, 200, nil
}
func (f *fakeGW) RejectApplication(_ context.Context, _, _, _, _ string) (service.RejectionResult, int, error) {
	return f.rejection, 200, nil
}
func (f *fakeGW) ApproveApplicationRaw(ctx context.Context, id, by string) (json.RawMessage, int, error) {
	res, code, err := f.ApproveApplication(ctx, id, by)
	if err != nil {
		return json.RawMessage(`{"code":"DOCUMENTS_REQUIRED","message":"required documents have not been uploaded"}`), code, nil
	}
	b, _ := json.Marshal(res)
	return b, code, nil
}
func (f *fakeGW) RejectApplicationRaw(_ context.Context, _, _, _, _ string) (json.RawMessage, int, error) {
	b, _ := json.Marshal(f.rejection)
	return b, 200, nil
}
func (f *fakeGW) StartApplicationReviewRaw(_ context.Context, _, _ string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"status":"UNDER_REVIEW"}`), 200, nil
}
func (f *fakeGW) LinkApplicationRaw(_ context.Context, _, merchantID, confirmation, _, reason string) (json.RawMessage, int, error) {
	f.linkCalls++
	f.lastLink = [3]string{merchantID, confirmation, reason}
	return json.RawMessage(`{"merchant_id":"` + merchantID + `"}`), 200, nil
}
func (f *fakeGW) ReissueActivationRaw(_ context.Context, _ string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"email":"l@x.co","business_name":"Loja","handle":"loja","activation_token":"REISSUED-SECRET"}`), 200, nil
}
func (f *fakeGW) LinkCandidatesRaw(_ context.Context, _, _ string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"candidates":[]}`), 200, nil
}
func (f *fakeGW) ApplicationBusinessStateRaw(_ context.Context, _ string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"business":null}`), 200, nil
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
func (f *fakeGW) RequestApplicationInformationRaw(_ context.Context, id, _, message string) (json.RawMessage, int, error) {
	f.infoMessage = message
	return json.RawMessage(`{"id":"` + id + `","status":"INFORMATION_REQUIRED","email":"loja@example.test"}`), 200, nil
}
func (f *fakeGW) BusinessStateRaw(context.Context, string) (json.RawMessage, int, error) {
	if f.businessHandle != "" {
		return json.RawMessage(`{"business":{"handle":"` + f.businessHandle + `"}}`), 200, nil
	}
	return json.RawMessage(`{"business":{}}`), 200, nil
}
func (f *fakeGW) ResetBusinessAppPinRaw(_ context.Context, id string) (json.RawMessage, int, error) {
	f.pinResets++
	return json.RawMessage(`{"merchant_id":"` + id + `","email":"loja@example.test","handle":"` + f.businessHandle + `","activation_token":"tok-reset","expires_at":"2026-09-13T00:00:00Z"}`), 200, nil
}
func (f *fakeGW) RejectDocumentRaw(_ context.Context, _, _, _, _ string) (json.RawMessage, int, error) {
	return json.RawMessage(`{"status":"REJECTED"}`), 200, nil
}

type fakeMailer struct {
	approvedTo, approvedURL, approvedEnv string
	rejectedTo, rejectedMsg              string
	approvedCalled                       bool
	rejectedCalled                       bool
	infoTo, infoRequest, infoURL         string
	pinResetTo, pinResetURL              string
}

func (m *fakeMailer) MerchantAppPinReset(to, _, _, url string) {
	m.pinResetTo, m.pinResetURL = to, url
}

func (m *fakeMailer) MerchantInformationRequested(to, request, url, _ string) {
	m.infoTo, m.infoRequest, m.infoURL = to, request, url
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
	r.Post("/admin/v1/merchant-applications/{id}/link-existing", h.LinkExisting)
	r.Post("/admin/v1/merchant-applications/{id}/reissue-activation", h.ReissueActivation)
	r.Post("/admin/v1/merchant-applications/{id}/request-information", h.RequestInformation)
	return r
}

// Asking for information needs a request someone can act on, reaches the
// gateway with it, and emails the applicant the request and where to answer.
func TestRequestInformation_EmailsTheRequestAndWhereToAnswerIt(t *testing.T) {
	gw, mailer := &fakeGW{}, &fakeMailer{}
	h := NewMerchantApplicationHandler(gw, nil, mailer, "https://banzami.com", nil)
	rec := httptest.NewRecorder()
	route(h).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/admin/v1/merchant-applications/app-1/request-information",
		strings.NewReader(`{"message":"  "}`)))
	if rec.Code != 400 || gw.infoMessage != "" {
		t.Fatalf("an empty request reached the gateway: %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	route(h).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/admin/v1/merchant-applications/app-1/request-information",
		strings.NewReader(`{"message":"Envie o registo comercial actualizado."}`)))
	if rec.Code != 200 || gw.infoMessage != "Envie o registo comercial actualizado." {
		t.Fatalf("%d %q", rec.Code, gw.infoMessage)
	}
	if mailer.infoTo != "loja@example.test" || mailer.infoURL != "https://banzami.com/comerciantes/candidatura/estado?ref=app-1" {
		t.Fatalf("email to %q with %q", mailer.infoTo, mailer.infoURL)
	}
}

// When the application isn't in the LIVE stack (404), approval must fall back to
// the SANDBOX stack so BANZADMIN can approve SANDBOX applications (ADR-025).
func TestApproveFallsBackToStagingOn404(t *testing.T) {
	live := &fakeGW{notFound: true}
	staging := &fakeGW{approval: service.ApprovalResult{
		MerchantID: "m-sb", Email: "s@x.co", Handle: "jrm",
		Environment: "SANDBOX", ActivationToken: "SB-TOKEN",
	}}
	h := NewMerchantApplicationHandler(live, staging, &fakeMailer{}, "https://banzami.com", nil)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/admin/v1/merchant-applications/app-x/approve", nil)
	route(h).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d want 200 (approved via staging), body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "m-sb") {
		t.Errorf("expected the SANDBOX stack's approval result, got %s", rec.Body.String())
	}
}

func TestApproveEmailsActivationLinkAndHidesToken(t *testing.T) {
	gw := &fakeGW{approval: service.ApprovalResult{
		MerchantID: "m1", Email: "lojista@x.co", BusinessName: "Loja",
		Handle: "loja_alex", ApiKeyPrefix: "bz_test_ab", ActivationToken: "RAW-SECRET-123",
	}}
	mailer := &fakeMailer{}
	h := NewMerchantApplicationHandler(gw, nil, mailer, "https://banzami.com", nil)

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
	h := NewMerchantApplicationHandler(&fakeGW{approveErr: errBoom}, nil, &fakeMailer{}, "https://banzami.com", nil)
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
	}}, nil, mailer, "https://banzami.com", nil)

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

// ReadMode mirrors the stored-mode read: no mode is an error, never a fallback.
func (p fakePlatform) ReadMode(context.Context) (string, error) {
	if p.mode != "SANDBOX" && p.mode != "LIVE" {
		return "", errors.New("platform mode unreadable")
	}
	return p.mode, nil
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
			h := NewMerchantApplicationHandler(gw, nil, mailer, "https://banzami.com", c.platform)
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

type fixedMode struct{ mode string }

// fallbackMode is the platform read failing: GetMode's display fallback says
// SANDBOX, ReadMode errors.
type fallbackMode struct{}

func (fallbackMode) GetMode(context.Context) service.PlatformMode {
	return service.PlatformMode{Mode: "SANDBOX", Reason: "fallback"}
}
func (fallbackMode) ReadMode(context.Context) (string, error) {
	return "", errors.New("connection refused")
}

func (f fixedMode) GetMode(context.Context) service.PlatformMode {
	return service.PlatformMode{Mode: f.mode}
}

// ReadMode mirrors the stored-mode read: no mode is an error, never a fallback.
func (f fixedMode) ReadMode(context.Context) (string, error) {
	if f.mode != "SANDBOX" && f.mode != "LIVE" {
		return "", errors.New("platform mode unreadable")
	}
	return f.mode, nil
}

// A repeated approval (a double click, a second operator) changed nothing: no
// email, no new link.
func TestApproveRepeatedSendsNoSecondEmail(t *testing.T) {
	gw := &fakeGW{approval: service.ApprovalResult{MerchantID: "m1", Email: "l@x.co", AlreadyApproved: true}}
	mailer := &fakeMailer{}
	h := NewMerchantApplicationHandler(gw, nil, mailer, "https://banzami.com", fixedMode{"SANDBOX"})
	rec := httptest.NewRecorder()
	route(h).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/admin/v1/merchant-applications/a/approve", nil))
	if rec.Code != 200 || mailer.approvedCalled || strings.Contains(rec.Body.String(), "activation_url") {
		t.Fatalf("code=%d emailed=%v body=%s", rec.Code, mailer.approvedCalled, rec.Body.String())
	}
}

// The gateway's precise refusal reaches the operator, not "could not approve".
func TestApproveForwardsThePreciseRefusal(t *testing.T) {
	h := NewMerchantApplicationHandler(&fakeGW{approveErr: errBoom}, nil, &fakeMailer{}, "https://banzami.com", nil)
	rec := httptest.NewRecorder()
	route(h).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/admin/v1/merchant-applications/a/approve", nil))
	if !strings.Contains(rec.Body.String(), "DOCUMENTS_REQUIRED") {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

// The activation link is shown to the operator only on a platform KNOWN to be
// in Sandbox mode; never on LIVE, and never when the mode cannot be read.
func TestActivationLinkIsShownOnlyInAKnownSandbox(t *testing.T) {
	for _, tc := range []struct {
		name string
		mode PlatformModeReader
		want bool
	}{
		{"sandbox", fixedMode{"SANDBOX"}, true},
		{"live", fixedMode{"LIVE"}, false},
		{"unknown", nil, false},
		// the display read falls back to SANDBOX on a failed read; the
		// credential decision must not — a LIVE Business's link was shown.
		{"read failed, display fallback SANDBOX", fallbackMode{}, false},
	} {
		gw := &fakeGW{approval: service.ApprovalResult{MerchantID: "m1", Email: "l@x.co", ActivationToken: "TOKEN-1"}}
		h := NewMerchantApplicationHandler(gw, nil, &fakeMailer{}, "https://banzami.com", tc.mode)
		for _, path := range []string{"approve", "reissue-activation"} {
			rec := httptest.NewRecorder()
			route(h).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/admin/v1/merchant-applications/a/"+path, nil))
			shown := strings.Contains(rec.Body.String(), "activation_url")
			if shown != tc.want {
				t.Errorf("%s %s: activation link shown=%v want %v (%s)", tc.name, path, shown, tc.want, rec.Body.String())
			}
		}
	}
}

// Linking needs a reason; the operator's choice is passed through untouched.
func TestLinkExistingRequiresAReason(t *testing.T) {
	gw := &fakeGW{}
	h := NewMerchantApplicationHandler(gw, nil, &fakeMailer{}, "https://banzami.com", nil)
	rec := httptest.NewRecorder()
	route(h).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/admin/v1/merchant-applications/a/link-existing",
		strings.NewReader(`{"merchant_id":"m-x","confirmation_handle":"@loja","reason":"  "}`)))
	if rec.Code != 400 || gw.linkCalls != 0 {
		t.Fatalf("no-reason link reached the gateway: code=%d calls=%d", rec.Code, gw.linkCalls)
	}
	rec = httptest.NewRecorder()
	route(h).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/admin/v1/merchant-applications/a/link-existing",
		strings.NewReader(`{"merchant_id":"m-x","confirmation_handle":"@loja","reason":"verified registration"}`)))
	if rec.Code != 200 || gw.lastLink != [3]string{"m-x", "@loja", "verified registration"} {
		t.Fatalf("code=%d link=%v", rec.Code, gw.lastLink)
	}
}
