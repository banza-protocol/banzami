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

// SUPPORT held operator.reset on any target, and in e-mail dry-run the reset
// link came back in the response: SUPPORT could take over an invited or
// un-enrolled SUPER_ADMIN. Now a SUPER_ADMIN target needs a SUPER_ADMIN actor,
// and a link is only ever returned to a SUPER_ADMIN.

type resetStoreFake struct {
	role   string
	tokens int
}

func (f *resetStoreFake) GetOperator(context.Context, string) (service.OperatorView, error) {
	return service.OperatorView{ID: "target", Email: "t@banzami.test", Role: f.role}, nil
}
func (f *resetStoreFake) CreateResetToken(context.Context, string, string) (string, time.Time, error) {
	f.tokens++
	return "raw-token", time.Now().Add(time.Hour), nil
}
func (f *resetStoreFake) ValidateResetToken(context.Context, string) (service.ResetTokenInfo, error) {
	return service.ResetTokenInfo{}, nil
}
func (f *resetStoreFake) CompleteReset(context.Context, string, string) (service.ResetCompletion, error) {
	return service.ResetCompletion{}, nil
}

func resetAs(t *testing.T, actorRole, targetRole string) (*httptest.ResponseRecorder, *resetStoreFake) {
	t.Helper()
	store := &resetStoreFake{role: targetRole}
	h := NewResetHandler(store, nil, "https://admin.banzami.test", true /* dry-run: links would be shown */)
	rt := chi.NewRouter()
	rt.Post("/admin/v1/operators/{id}/password-reset", h.Request)
	req := httptest.NewRequest(http.MethodPost, "/admin/v1/operators/target/password-reset", nil)
	req = req.WithContext(auth.WithPrincipal(req.Context(), auth.Principal{ID: "actor", Email: "a@banzami.test", Role: actorRole}))
	w := httptest.NewRecorder()
	rt.ServeHTTP(w, req)
	return w, store
}

func TestPasswordReset_SupportCannotTouchASuperAdmin(t *testing.T) {
	w, store := resetAs(t, "SUPPORT", "SUPER_ADMIN")
	if w.Code != http.StatusForbidden || store.tokens != 0 {
		t.Fatalf("SUPPORT reset a SUPER_ADMIN: %d, tokens issued %d", w.Code, store.tokens)
	}
}

func TestPasswordReset_OnlyASuperAdminEverSeesTheLink(t *testing.T) {
	w, _ := resetAs(t, "SUPPORT", "OPERATIONS")
	if w.Code != http.StatusOK || strings.Contains(w.Body.String(), "reset_url") || strings.Contains(w.Body.String(), "raw-token") {
		t.Fatalf("SUPPORT received the reset link: %d %s", w.Code, w.Body.String())
	}
	w, _ = resetAs(t, "SUPER_ADMIN", "OPERATIONS")
	if !strings.Contains(w.Body.String(), "reset_url") {
		t.Fatalf("a SUPER_ADMIN in dry-run must still get the link to deliver: %s", w.Body.String())
	}
}
