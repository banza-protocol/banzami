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

// sessionToken is a session as sign-in mints it: AuthTime now, idle expiry.
func sessionToken(t *testing.T, p auth.Principal) string {
	t.Helper()
	tok, _, err := auth.IssueSession(secret, p, time.Now(), auth.SessionAbsoluteLifetime)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

// withSession attaches tok the way the browser does: as the session cookie.
func withSession(r *http.Request, tok string) {
	r.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: tok})
}

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
	code = run(AdminJWT(secret, ops), func(r *http.Request) { withSession(r, "sk_live_not_a_jwt") })
	if code != http.StatusUnauthorized {
		t.Fatalf("non-JWT session cookie must be 401, got %d", code)
	}
}

// A6-12. The session is the HttpOnly cookie. A perfectly valid session JWT
// presented as a bearer header is refused: no legitimate caller can hold one
// any more (none is ever handed to JavaScript), so the header would only be a
// second way in for a token lifted from somewhere.
func TestRejectsAValidSessionPresentedAsABearer(t *testing.T) {
	ops := &fakeOps{user: &service.AdminUser{ID: "u1", Email: "op@banzami.com", Status: "ACTIVE", Role: "OPERATIONS"}}
	tok := sessionToken(t, auth.Principal{ID: "u1", Email: "op@banzami.com", Role: "OPERATIONS"})
	code := run(AdminJWT(secret, ops), func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+tok) })
	if code != http.StatusUnauthorized {
		t.Fatalf("a bearer session must be refused (401), got %d", code)
	}
}

func TestAcceptsValidToken(t *testing.T) {
	ops := &fakeOps{user: &service.AdminUser{ID: "u1", Email: "op@banzami.com", Status: "ACTIVE", Role: "OPERATIONS"}}
	tok := sessionToken(t, auth.Principal{ID: "u1", Email: "op@banzami.com", Role: "OPERATIONS"})
	code := run(AdminJWT(secret, ops), func(r *http.Request) { withSession(r, tok) })
	if code != http.StatusOK {
		t.Fatalf("valid token must pass, got %d", code)
	}
}

func TestRejectsSuspended(t *testing.T) {
	ops := &fakeOps{user: &service.AdminUser{ID: "u1", Status: "SUSPENDED"}}
	tok := sessionToken(t, auth.Principal{ID: "u1"})
	code := run(AdminJWT(secret, ops), func(r *http.Request) { withSession(r, tok) })
	if code != http.StatusForbidden {
		t.Fatalf("suspended operator must be 403, got %d", code)
	}
}

func TestRejectsStaleTokenVersion(t *testing.T) {
	// DB has token_version 2 (e.g. after a "terminate sessions"); the token was
	// minted at version 1 → must be rejected as a revoked session.
	ops := &fakeOps{user: &service.AdminUser{ID: "u1", Status: "ACTIVE", Role: "OPERATIONS", TokenVersion: 2}}
	tok := sessionToken(t, auth.Principal{ID: "u1", Role: "OPERATIONS", TokenVersion: 1})
	code := run(AdminJWT(secret, ops), func(r *http.Request) { withSession(r, tok) })
	if code != http.StatusUnauthorized {
		t.Fatalf("stale token_version must be 401, got %d", code)
	}
}

func TestAcceptsMatchingTokenVersion(t *testing.T) {
	ops := &fakeOps{user: &service.AdminUser{ID: "u1", Status: "ACTIVE", Role: "OPERATIONS", TokenVersion: 5}}
	tok := sessionToken(t, auth.Principal{ID: "u1", Role: "OPERATIONS", TokenVersion: 5})
	code := run(AdminJWT(secret, ops), func(r *http.Request) { withSession(r, tok) })
	if code != http.StatusOK {
		t.Fatalf("matching token_version must pass, got %d", code)
	}
}
