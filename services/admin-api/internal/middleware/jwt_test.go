package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type fakeOps struct{ user *service.AdminUser }

func (f *fakeOps) GetByID(_ context.Context, id string) (service.AdminUser, error) {
	if f.user != nil && f.user.ID == id {
		return *f.user, nil
	}
	return service.AdminUser{}, service.ErrAdminUserNotFound
}

func ok(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }

func run(mw func(http.Handler) http.Handler, setup func(*http.Request)) int {
	r := httptest.NewRequest("GET", "/admin/v1/auth/me", nil)
	if setup != nil {
		setup(r)
	}
	w := httptest.NewRecorder()
	mw(http.HandlerFunc(ok)).ServeHTTP(w, r)
	return w.Code
}

const secret = "secret-xyz"

func TestRejectsAdminKey(t *testing.T) {
	ops := &fakeOps{user: &service.AdminUser{ID: "u1", Status: "ACTIVE"}}
	code := run(AdminJWT(secret, ops), func(r *http.Request) { r.Header.Set("X-Admin-Key", "sk_live_legacy") })
	if code != http.StatusUnauthorized {
		t.Fatalf("X-Admin-Key must be rejected (401), got %d", code)
	}
}

func TestRejectsMissingToken(t *testing.T) {
	ops := &fakeOps{user: &service.AdminUser{ID: "u1", Status: "ACTIVE"}}
	if code := run(AdminJWT(secret, ops), nil); code != http.StatusUnauthorized {
		t.Fatalf("missing token must be 401, got %d", code)
	}
}

func TestRejectsArbitraryBearer(t *testing.T) {
	ops := &fakeOps{user: &service.AdminUser{ID: "u1", Status: "ACTIVE"}}
	code := run(AdminJWT(secret, ops), func(r *http.Request) { r.Header.Set("Authorization", "Bearer sk_live_not_a_jwt") })
	if code != http.StatusUnauthorized {
		t.Fatalf("non-JWT bearer must be 401, got %d", code)
	}
}

func TestAcceptsValidToken(t *testing.T) {
	ops := &fakeOps{user: &service.AdminUser{ID: "u1", Email: "op@banzami.com", Status: "ACTIVE", Role: "OPERATIONS"}}
	tok, _, _ := auth.Issue(secret, auth.Principal{ID: "u1", Email: "op@banzami.com", Role: "OPERATIONS"}, time.Hour, time.Now())
	code := run(AdminJWT(secret, ops), func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+tok) })
	if code != http.StatusOK {
		t.Fatalf("valid token must pass, got %d", code)
	}
}

func TestRejectsSuspended(t *testing.T) {
	ops := &fakeOps{user: &service.AdminUser{ID: "u1", Status: "SUSPENDED"}}
	tok, _, _ := auth.Issue(secret, auth.Principal{ID: "u1"}, time.Hour, time.Now())
	code := run(AdminJWT(secret, ops), func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+tok) })
	if code != http.StatusForbidden {
		t.Fatalf("suspended operator must be 403, got %d", code)
	}
}
