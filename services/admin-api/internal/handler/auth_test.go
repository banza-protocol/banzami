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
	user        *service.AdminUser
	updatedHash string
	resetCalls  int
	attempts    []string // "success:reason"
	transitions []string // "FROM→TO"
}

func (f *fakeStore) GetByEmail(_ context.Context, email string) (service.AdminUser, error) {
	if f.user != nil && strings.EqualFold(f.user.Email, email) {
		return *f.user, nil
	}
	return service.AdminUser{}, service.ErrAdminUserNotFound
}
func (f *fakeStore) GetByID(_ context.Context, id string) (service.AdminUser, error) {
	if f.user != nil && f.user.ID == id {
		return *f.user, nil
	}
	return service.AdminUser{}, service.ErrAdminUserNotFound
}
func (f *fakeStore) UpdatePassword(_ context.Context, id, hash string) error {
	f.updatedHash = hash
	if f.user != nil && f.user.ID == id {
		f.user.PasswordHash = hash
	}
	return nil
}
func (f *fakeStore) RecordFailedLogin(_ context.Context, id string) (*time.Time, error) {
	if f.user != nil && f.user.ID == id {
		f.user.FailedLoginAttempts++
		if f.user.FailedLoginAttempts >= service.MaxFailedLogins {
			t := time.Now().Add(service.LockoutWindow)
			f.user.LockedUntil = &t
		}
		return f.user.LockedUntil, nil
	}
	return nil, nil
}
func (f *fakeStore) ResetLoginCountersAndTouch(_ context.Context, id string) {
	f.resetCalls++
	if f.user != nil && f.user.ID == id {
		f.user.FailedLoginAttempts = 0
		f.user.LockedUntil = nil
	}
}
func (f *fakeStore) RecordLoginAttempt(_ context.Context, _ string, _ *string, _, _ string, success bool, reason string) {
	f.attempts = append(f.attempts, map[bool]string{true: "success", false: "fail"}[success]+":"+reason)
}

// Records the lifecycle transitions a test drove, so an assertion can check the
// state moved and not merely that a response was 200.
func (f *fakeStore) AdvanceLifecycle(_ context.Context, id, from, to string) error {
	if f.user != nil && f.user.ID == id && f.user.Status == from {
		f.user.Status = to
		f.transitions = append(f.transitions, from+"→"+to)
		return nil
	}
	return service.ErrLifecycleNotApplicable
}

func (f *fakeStore) BumpTokenVersion(_ context.Context, id string) error {
	if f.user != nil && f.user.ID == id {
		f.user.TokenVersion++
	}
	return nil
}

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
	if store.resetCalls == 0 {
		t.Fatal("successful login should reset counters + touch last_login")
	}
	if len(store.attempts) == 0 || store.attempts[len(store.attempts)-1] != "success:" {
		t.Fatalf("successful login should record a success attempt: %v", store.attempts)
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
	// Anti-enumeration: a suspended account responds exactly like a wrong
	// password (generic 401) — never a distinct 403/"suspended" signal.
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("suspended user must be a generic 401, got %d", w.Code)
	}
	if strings.Contains(w.Body.String(), "token") {
		t.Fatalf("suspended login must not issue a token: %s", w.Body.String())
	}
}

func TestLogin_TerminateSessions(t *testing.T) {
	u := activeUser(t)
	store := &fakeStore{user: u}
	h := NewAuthHandler(store, "secret-xyz", time.Hour)
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/admin/v1/auth/terminate-sessions", nil)
	r = r.WithContext(auth.WithPrincipal(r.Context(), principalFor(u)))
	h.TerminateSessions(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("terminate-sessions must be 200, got %d", w.Code)
	}
	if u.TokenVersion != 1 {
		t.Fatalf("terminate-sessions must bump token_version, got %d", u.TokenVersion)
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

// --- lockout --------------------------------------------------------------

func TestLogin_LocksAfterFiveFailures(t *testing.T) {
	store := &fakeStore{user: activeUser(t)}
	h := NewAuthHandler(store, "secret-xyz", time.Hour)
	for i := 0; i < service.MaxFailedLogins; i++ {
		w := httptest.NewRecorder()
		h.Login(w, loginReq(`{"email":"op@banzami.com","password":"wrong-password-x"}`))
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: want 401, got %d", i+1, w.Code)
		}
	}
	// Now locked → next attempt (even correct password) is 429.
	w := httptest.NewRecorder()
	h.Login(w, loginReq(`{"email":"op@banzami.com","password":"a-strong-password"}`))
	if w.Code != http.StatusTooManyRequests || !strings.Contains(w.Body.String(), "TOO_MANY_ATTEMPTS") {
		t.Fatalf("locked account must be 429, got %d %s", w.Code, w.Body.String())
	}
}

func TestLogin_LockedReturns429(t *testing.T) {
	u := activeUser(t)
	lock := time.Now().Add(10 * time.Minute)
	u.LockedUntil = &lock
	h := NewAuthHandler(&fakeStore{user: u}, "secret-xyz", time.Hour)
	w := httptest.NewRecorder()
	h.Login(w, loginReq(`{"email":"op@banzami.com","password":"a-strong-password"}`))
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("want 429, got %d", w.Code)
	}
}

func TestLogin_UnknownEmailRecordsAttempt(t *testing.T) {
	store := &fakeStore{user: activeUser(t)}
	h := NewAuthHandler(store, "secret-xyz", time.Hour)
	w := httptest.NewRecorder()
	h.Login(w, loginReq(`{"email":"ghost@banzami.com","password":"a-strong-password"}`))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("unknown email must be 401, got %d", w.Code)
	}
	if len(store.attempts) != 1 || store.attempts[0] != "fail:UNKNOWN_EMAIL" {
		t.Fatalf("unknown email should record a fail attempt: %v", store.attempts)
	}
}

// --- change password ------------------------------------------------------

func changeReq(body string, p auth.Principal) *http.Request {
	r := httptest.NewRequest("POST", "/admin/v1/auth/change-password", strings.NewReader(body))
	return r.WithContext(auth.WithPrincipal(r.Context(), p))
}

func principalFor(u *service.AdminUser) auth.Principal {
	return auth.Principal{ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role}
}

func TestChangePassword_Success(t *testing.T) {
	u := activeUser(t) // current password is "a-strong-password"
	store := &fakeStore{user: u}
	h := NewAuthHandler(store, "secret-xyz", time.Hour)
	w := httptest.NewRecorder()
	h.ChangePassword(w, changeReq(`{"current_password":"a-strong-password","new_password":"a-brand-new-password"}`, principalFor(u)))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"ok":true`) {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	body := w.Body.String()
	if strings.Contains(body, "password") || strings.Contains(body, "hash") || strings.Contains(body, "$2") {
		t.Fatalf("response leaks password material: %s", body)
	}
	// Hash changed and the new password verifies; the old one no longer does.
	if store.updatedHash == "" || !auth.VerifyPassword(store.updatedHash, "a-brand-new-password") {
		t.Fatal("new password should verify against the stored hash")
	}
	if auth.VerifyPassword(store.updatedHash, "a-strong-password") {
		t.Fatal("old password must no longer verify")
	}
}

func TestChangePassword_WrongCurrent(t *testing.T) {
	u := activeUser(t)
	h := NewAuthHandler(&fakeStore{user: u}, "secret-xyz", time.Hour)
	w := httptest.NewRecorder()
	h.ChangePassword(w, changeReq(`{"current_password":"nope-nope-nope","new_password":"a-brand-new-password"}`, principalFor(u)))
	// 400 (not 401, so the client does not auto-logout) with a safe code.
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "INVALID_CURRENT_PASSWORD") {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestChangePassword_Weak(t *testing.T) {
	u := activeUser(t)
	h := NewAuthHandler(&fakeStore{user: u}, "secret-xyz", time.Hour)
	w := httptest.NewRecorder()
	h.ChangePassword(w, changeReq(`{"current_password":"a-strong-password","new_password":"short"}`, principalFor(u)))
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "WEAK_PASSWORD") {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestChangePassword_Same(t *testing.T) {
	u := activeUser(t)
	h := NewAuthHandler(&fakeStore{user: u}, "secret-xyz", time.Hour)
	w := httptest.NewRecorder()
	h.ChangePassword(w, changeReq(`{"current_password":"a-strong-password","new_password":"a-strong-password"}`, principalFor(u)))
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "SAME_PASSWORD") {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestChangePassword_Unauthenticated(t *testing.T) {
	u := activeUser(t)
	h := NewAuthHandler(&fakeStore{user: u}, "secret-xyz", time.Hour)
	w := httptest.NewRecorder()
	// No principal in context (e.g., route reached without the JWT middleware).
	r := httptest.NewRequest("POST", "/x", strings.NewReader(`{"current_password":"a-strong-password","new_password":"a-brand-new-password"}`))
	h.ChangePassword(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("missing principal must be 401, got %d", w.Code)
	}
}
