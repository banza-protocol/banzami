package middleware

// A5-08: idle expiry, the absolute lifetime and the sliding refresh, as the
// session middleware enforces them.

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

func sessionOp() *fakeOps {
	return &fakeOps{user: &service.AdminUser{ID: "u1", Email: "op@banzami.com", Status: "ACTIVE", Role: "OPERATIONS", TokenVersion: 2}}
}

func sessionAt(t *testing.T, p auth.Principal, issuedAt time.Time) string {
	t.Helper()
	tok, _, err := auth.IssueSession(secret, p, issuedAt, auth.SessionAbsoluteLifetime)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func serve(mw func(http.Handler) http.Handler, method, tok string, setup func(*http.Request)) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/admin/v1/auth/me", nil)
	withSession(r, tok)
	if setup != nil {
		setup(r)
	}
	w := httptest.NewRecorder()
	mw(http.HandlerFunc(ok)).ServeHTTP(w, r)
	return w
}

func setCookie(w *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, c := range w.Result().Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

// Thirty minutes without a request and the session is over. The 12-hour token
// had no idle expiry at all: a console left open on a desk stayed signed in
// until the evening.
func TestSession_IdleExpiry(t *testing.T) {
	ops := sessionOp()
	now := time.Now()
	p := auth.Principal{ID: "u1", Role: "OPERATIONS", TokenVersion: 2}

	p.AuthTime = now.Add(-31 * time.Minute)
	if w := serve(AdminJWT(secret, ops), http.MethodGet, sessionAt(t, p, now.Add(-31*time.Minute)), nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("a session idle for 31 minutes was served: %d", w.Code)
	}

	p.AuthTime = now.Add(-29 * time.Minute)
	w := serve(AdminJWT(secret, ops), http.MethodGet, sessionAt(t, p, now.Add(-29*time.Minute)), nil)
	if w.Code != http.StatusOK {
		t.Fatalf("a session used 29 minutes ago was refused: %d", w.Code)
	}
	// And using it slides the deadline: the cookie that comes back is good for
	// another full idle period, not for the minute the old one had left.
	c := setCookie(w, auth.SessionCookieName)
	if c == nil {
		t.Fatal("an operator request did not refresh the session")
	}
	fresh, err := auth.Parse(secret, c.Value)
	if err != nil {
		t.Fatalf("the refreshed session does not parse: %v", err)
	}
	if fresh.AuthTime.Unix() != p.AuthTime.Unix() {
		t.Fatal("sliding the session moved its sign-in time — the absolute lifetime would never arrive")
	}
	if c.MaxAge < int((auth.SessionIdleTimeout - time.Minute).Seconds()) {
		t.Fatalf("the refreshed cookie lives %ds, want about the idle timeout", c.MaxAge)
	}
}

// The badges poll every 30 seconds. If a poll counted as activity, an open tab
// would never go idle; the console marks polls passive and they do not slide.
func TestSession_PassiveRequestsDoNotExtendIt(t *testing.T) {
	ops := sessionOp()
	now := time.Now()
	p := auth.Principal{ID: "u1", Role: "OPERATIONS", TokenVersion: 2, AuthTime: now.Add(-10 * time.Minute)}
	w := serve(AdminJWT(secret, ops), http.MethodGet, sessionAt(t, p, now.Add(-10*time.Minute)), func(r *http.Request) {
		r.Header.Set(auth.ActivityHeader, auth.ActivityPassive)
	})
	if w.Code != http.StatusOK {
		t.Fatalf("a passive request was refused: %d", w.Code)
	}
	if len(w.Header().Values("Set-Cookie")) != 0 {
		t.Fatalf("a passive request extended the session: %v", w.Header().Values("Set-Cookie"))
	}
}

// Sliding never outlives the absolute lifetime, and the middleware checks it
// itself rather than trusting that every issuer capped exp.
func TestSession_AbsoluteLifetime(t *testing.T) {
	ops := sessionOp()
	now := time.Now()
	old := auth.Principal{ID: "u1", Role: "OPERATIONS", TokenVersion: 2, AuthTime: now.Add(-auth.SessionAbsoluteLifetime - time.Minute), Purpose: auth.PurposeSession}
	tok, _, err := auth.Issue(secret, old, 10*time.Minute, now) // exp NOT capped
	if err != nil {
		t.Fatal(err)
	}
	if w := serve(AdminJWT(secret, ops), http.MethodGet, tok, nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("a session past its absolute lifetime was served: %d", w.Code)
	}
	noAuthTime := auth.Principal{ID: "u1", Role: "OPERATIONS", TokenVersion: 2, Purpose: auth.PurposeSession}
	tok, _, _ = auth.Issue(secret, noAuthTime, 10*time.Minute, now)
	if w := serve(AdminJWT(secret, ops), http.MethodGet, tok, nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("a session with no sign-in time was served: %d", w.Code)
	}
}

// Every state-changing method needs the CSRF token; the safe ones do not.
func TestSession_CSRFOnEveryMutatingMethod(t *testing.T) {
	ops := sessionOp()
	now := time.Now()
	p := auth.Principal{ID: "u1", Role: "OPERATIONS", TokenVersion: 2, AuthTime: now}
	tok := sessionAt(t, p, now)
	for _, m := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		w := serve(AdminJWT(secret, ops), m, tok, nil)
		if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "CSRF_REJECTED") {
			t.Fatalf("%s without a CSRF token was served: %d", m, w.Code)
		}
		w = serve(AdminJWT(secret, ops), m, tok, func(r *http.Request) { r.Header.Set(auth.CSRFHeader, auth.CSRFToken(secret, p)) })
		if w.Code != http.StatusOK {
			t.Fatalf("%s with the right CSRF token was refused: %d %s", m, w.Code, w.Body.String())
		}
	}
	for _, m := range []string{http.MethodGet, http.MethodHead} {
		if w := serve(AdminJWT(secret, ops), m, tok, nil); w.Code != http.StatusOK {
			t.Fatalf("%s without a CSRF token was refused: %d", m, w.Code)
		}
	}
}
