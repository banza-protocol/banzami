package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type fakeReset struct {
	op         service.OperatorView
	created    string // raw token returned
	validate   service.ResetTokenInfo
	complete   string // reason returned
	lastHash   string
	mailedLink string
}

func (f *fakeReset) GetOperator(_ context.Context, id string) (service.OperatorView, error) {
	if f.op.ID == id {
		return f.op, nil
	}
	return service.OperatorView{}, service.ErrAdminUserNotFound
}
func (f *fakeReset) CreateResetToken(_ context.Context, _, _ string) (string, time.Time, error) {
	return f.created, time.Now().Add(24 * time.Hour), nil
}
func (f *fakeReset) ValidateResetToken(_ context.Context, _ string) (service.ResetTokenInfo, error) {
	return f.validate, nil
}
func (f *fakeReset) CompleteReset(_ context.Context, _, hash string) (string, error) {
	f.lastHash = hash
	return f.complete, nil
}

func (f *fakeReset) AdminPasswordReset(_, _, link string) { f.mailedLink = link }

func resetRouter(h *ResetHandler) http.Handler {
	r := chi.NewRouter()
	r.Post("/admin/v1/operators/{id}/password-reset", h.Request)
	r.Post("/admin/v1/auth/password-reset/validate", h.Validate)
	r.Post("/admin/v1/auth/password-reset/complete", h.Complete)
	return r
}

func superReq(method, path, body string) *http.Request {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	return r.WithContext(auth.WithPrincipal(r.Context(), auth.Principal{ID: "sa", Role: "SUPER_ADMIN"}))
}

func TestReset_RequestRequiresSuperAdmin(t *testing.T) {
	f := &fakeReset{op: service.OperatorView{ID: "op", Email: "op@b.co"}, created: "rawtok"}
	h := NewResetHandler(f, f, "https://admin.banzami.com", false)
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/admin/v1/operators/op/password-reset", nil)
	r = r.WithContext(auth.WithPrincipal(r.Context(), auth.Principal{ID: "x", Role: "OPERATIONS"}))
	resetRouter(h).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("non-superadmin must be 403, got %d", w.Code)
	}
}

func TestReset_RequestShowsLinkInDryRun(t *testing.T) {
	f := &fakeReset{op: service.OperatorView{ID: "op", Email: "op@b.co"}, created: "rawtok"}
	h := NewResetHandler(f, f, "https://admin.banzami.com", true) // showLink
	w := httptest.NewRecorder()
	resetRouter(h).ServeHTTP(w, superReq("POST", "/admin/v1/operators/op/password-reset", ""))
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "reset-password?token=rawtok") {
		t.Fatalf("dry-run should return reset_url: %s", w.Body.String())
	}
}

func TestReset_RequestHidesLinkWhenEmailOn(t *testing.T) {
	f := &fakeReset{op: service.OperatorView{ID: "op", Email: "op@b.co"}, created: "rawtok"}
	h := NewResetHandler(f, f, "https://admin.banzami.com", false) // no showLink
	w := httptest.NewRecorder()
	resetRouter(h).ServeHTTP(w, superReq("POST", "/admin/v1/operators/op/password-reset", ""))
	if strings.Contains(w.Body.String(), "reset_url") || strings.Contains(w.Body.String(), "rawtok") {
		t.Fatalf("token/link must not be in the response when emailed: %s", w.Body.String())
	}
	if f.mailedLink == "" {
		t.Fatal("the link should have been emailed")
	}
}

func TestReset_Validate(t *testing.T) {
	for _, tc := range []struct{ reason, want string }{
		{service.ResetValid, `"valid":true`},
		{service.ResetExpired, `"valid":false`},
		{service.ResetUsed, `"valid":false`},
		{service.ResetInvalid, `"valid":false`},
	} {
		f := &fakeReset{validate: service.ResetTokenInfo{Reason: tc.reason, FullName: "Op"}}
		h := NewResetHandler(f, f, "x", false)
		w := httptest.NewRecorder()
		resetRouter(h).ServeHTTP(w, httptest.NewRequest("POST", "/admin/v1/auth/password-reset/validate", strings.NewReader(`{"token":"t"}`)))
		if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), tc.want) {
			t.Fatalf("reason %s → %s", tc.reason, w.Body.String())
		}
	}
}

func TestReset_CompleteSuccess(t *testing.T) {
	f := &fakeReset{complete: service.ResetValid}
	h := NewResetHandler(f, f, "x", false)
	w := httptest.NewRecorder()
	resetRouter(h).ServeHTTP(w, httptest.NewRequest("POST", "/admin/v1/auth/password-reset/complete", strings.NewReader(`{"token":"t","new_password":"a-strong-password"}`)))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"ok":true`) {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if f.lastHash == "" || !auth.VerifyPassword(f.lastHash, "a-strong-password") {
		t.Fatal("complete should hash and store the new password")
	}
}

func TestReset_CompleteWeak(t *testing.T) {
	f := &fakeReset{complete: service.ResetValid}
	h := NewResetHandler(f, f, "x", false)
	w := httptest.NewRecorder()
	resetRouter(h).ServeHTTP(w, httptest.NewRequest("POST", "/admin/v1/auth/password-reset/complete", strings.NewReader(`{"token":"t","new_password":"short"}`)))
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "WEAK_PASSWORD") {
		t.Fatalf("weak password must be 400, got %d", w.Code)
	}
}

func TestReset_CompleteUsedOrExpired(t *testing.T) {
	for _, reason := range []string{service.ResetUsed, service.ResetExpired, service.ResetInvalid} {
		f := &fakeReset{complete: reason}
		h := NewResetHandler(f, f, "x", false)
		w := httptest.NewRecorder()
		resetRouter(h).ServeHTTP(w, httptest.NewRequest("POST", "/admin/v1/auth/password-reset/complete", strings.NewReader(`{"token":"t","new_password":"a-strong-password"}`)))
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "INVALID_TOKEN_"+reason) {
			t.Fatalf("reason %s must be 400 with code, got %d %s", reason, w.Code, w.Body.String())
		}
	}
}
