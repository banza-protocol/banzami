package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type fakeStore struct {
	user      *service.AdminUser
	touchedID string
}

func (f *fakeStore) GetByEmail(_ context.Context, email string) (service.AdminUser, error) {
	if f.user != nil && strings.EqualFold(f.user.Email, email) {
		return *f.user, nil
	}
	return service.AdminUser{}, service.ErrAdminUserNotFound
}
func (f *fakeStore) TouchLastLogin(_ context.Context, id string) { f.touchedID = id }

func loginReq(body string) *http.Request {
	return httptest.NewRequest("POST", "/admin/v1/auth/login", strings.NewReader(body))
}

func activeUser(t *testing.T) *service.AdminUser {
	t.Helper()
	hash, _ := auth.HashPassword("a-strong-password")
	return &service.AdminUser{ID: "u1", Email: "op@banzami.com", FullName: "Op Silva", Role: "OPERATIONS", Status: "ACTIVE", PasswordHash: hash}
}

func TestLogin_Success(t *testing.T) {
	store := &fakeStore{user: activeUser(t)}
	h := NewAuthHandler(store, "secret-xyz", time.Hour)
	w := httptest.NewRecorder()
	h.Login(w, loginReq(`{"email":"op@banzami.com","password":"a-strong-password"}`))
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	body := w.Body.String()
	if !strings.Contains(body, `"token"`) || !strings.Contains(body, `"full_name":"Op Silva"`) {
		t.Fatalf("missing token/user: %s", body)
	}
	if strings.Contains(body, "password") || strings.Contains(body, "PasswordHash") {
		t.Fatalf("login response leaks password material: %s", body)
	}
	if store.touchedID != "u1" {
		t.Fatal("last_login should be touched")
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	h := NewAuthHandler(&fakeStore{user: activeUser(t)}, "secret-xyz", time.Hour)
	w := httptest.NewRecorder()
	h.Login(w, loginReq(`{"email":"op@banzami.com","password":"nope-nope-nope"}`))
	if w.Code != http.StatusUnauthorized || strings.Contains(w.Body.String(), "exist") {
		t.Fatalf("want generic 401, got %d %s", w.Code, w.Body.String())
	}
}

func TestLogin_UnknownEmail(t *testing.T) {
	h := NewAuthHandler(&fakeStore{user: activeUser(t)}, "secret-xyz", time.Hour)
	w := httptest.NewRecorder()
	h.Login(w, loginReq(`{"email":"ghost@banzami.com","password":"a-strong-password"}`))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("unknown email must be a generic 401, got %d", w.Code)
	}
}

func TestLogin_Suspended(t *testing.T) {
	u := activeUser(t)
	u.Status = "SUSPENDED"
	h := NewAuthHandler(&fakeStore{user: u}, "secret-xyz", time.Hour)
	w := httptest.NewRecorder()
	h.Login(w, loginReq(`{"email":"op@banzami.com","password":"a-strong-password"}`))
	if w.Code != http.StatusForbidden {
		t.Fatalf("suspended user must be 403, got %d", w.Code)
	}
}

func TestLogin_NotConfigured(t *testing.T) {
	h := NewAuthHandler(nil, "", time.Hour)
	w := httptest.NewRecorder()
	h.Login(w, loginReq(`{"email":"x@x.co","password":"a-strong-password"}`))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("nil store must be 503, got %d", w.Code)
	}
}
