package handler

// The operator session end to end, through the same middleware chain as
// server.go (A6-12, A5-08): the cookie a sign-in sets, what logout does on the
// server, and the step-up the highest-risk routes demand.

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/middleware"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// cookieNamed returns the cookie of that name a response set, or nil.
func cookieNamed(w *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, c := range w.Result().Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

// sessionFrom is the session a response set, parsed. Fails the test when the
// response set none.
func sessionFrom(t *testing.T, w *httptest.ResponseRecorder) auth.Principal {
	t.Helper()
	return sessionFromWith(t, w, testSecret)
}

func sessionFromWith(t *testing.T, w *httptest.ResponseRecorder, secret string) auth.Principal {
	t.Helper()
	c := cookieNamed(w, auth.SessionCookieName)
	if c == nil || c.Value == "" {
		t.Fatalf("no session cookie was set (Set-Cookie: %v)", w.Header().Values("Set-Cookie"))
	}
	p, err := auth.Parse(secret, c.Value)
	if err != nil {
		t.Fatalf("the session cookie does not parse: %v", err)
	}
	return p
}

// A6-12. The session is an HttpOnly, Secure, SameSite=Strict __Host- cookie,
// and the CSRF token beside it is readable (the console echoes it) but equally
// host-bound. Each attribute is a separate guarantee, so each is asserted.
func TestSession_CookieFlags(t *testing.T) {
	h, _, u := mfaFixture(t, true)
	w := post(h.Verify, tokenFor(t, u, auth.PurposeMFAChallenge), `{"code":"123456"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("verify failed: %d %s", w.Code, w.Body.String())
	}
	s := cookieNamed(w, auth.SessionCookieName)
	if s == nil {
		t.Fatal("no session cookie")
	}
	if !strings.HasPrefix(s.Name, "__Host-") {
		t.Errorf("session cookie %q lacks the __Host- prefix", s.Name)
	}
	if !s.HttpOnly {
		t.Error("session cookie is readable by script (HttpOnly missing)")
	}
	if !s.Secure {
		t.Error("session cookie is not Secure")
	}
	if s.SameSite != http.SameSiteStrictMode {
		t.Errorf("session cookie SameSite = %v, want Strict", s.SameSite)
	}
	if s.Path != "/" || s.Domain != "" {
		t.Errorf("session cookie Path=%q Domain=%q, want / and none (a __Host- cookie)", s.Path, s.Domain)
	}
	if s.MaxAge <= 0 || s.MaxAge > int(auth.SessionIdleTimeout.Seconds()) {
		t.Errorf("session cookie Max-Age %d, want within the idle timeout", s.MaxAge)
	}

	c := cookieNamed(w, auth.CSRFCookieName)
	if c == nil {
		t.Fatal("no CSRF cookie")
	}
	if c.HttpOnly {
		t.Error("the CSRF cookie is HttpOnly — the console could not echo it")
	}
	if !c.Secure || c.SameSite != http.SameSiteStrictMode || c.Path != "/" || c.Domain != "" || !strings.HasPrefix(c.Name, "__Host-") {
		t.Errorf("CSRF cookie is not a strict __Host- cookie: %+v", c)
	}
	if c.Value != auth.CSRFToken(testSecret, sessionFrom(t, w)) {
		t.Error("the CSRF cookie does not carry the token for this session")
	}
}

// consoleRouter mounts the routes these tests drive exactly as server.go does:
// session middleware, then a step-up gate on the high-risk route.
func consoleRouter(store *fakeStore, mfa MFAStore) http.Handler {
	authH := NewAuthHandler(store, testSecret, auth.SessionAbsoluteLifetime)
	mfaH := NewMFAHandler(mfa, store, testSecret, auth.SessionAbsoluteLifetime)
	r := chi.NewRouter()
	r.Group(func(r chi.Router) {
		r.Use(middleware.AdminJWT(testSecret, store))
		r.Get("/admin/v1/auth/me", authH.Me)
		r.Post("/admin/v1/auth/logout", authH.Logout)
		r.Post("/admin/v1/auth/step-up", mfaH.StepUp)
		r.With(middleware.RequireStepUp(auth.StepUpWindow)).Post("/admin/v1/operators", func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusCreated)
		})
	})
	return r
}

func consoleStore(t *testing.T) *fakeStore {
	t.Helper()
	return &fakeStore{user: &service.AdminUser{ID: "op-1", Email: "fidel.monteiro@banzami.com", FullName: "Fidel Monteiro", Role: "SUPER_ADMIN", Status: "ACTIVE", TokenVersion: 3}}
}

// signedIn is a session as /mfa/verify issues it, at `at`.
func signedIn(t *testing.T, u service.AdminUser, at time.Time, steppedUp time.Time) auth.Principal {
	t.Helper()
	return auth.Principal{ID: u.ID, Email: u.Email, Role: u.Role, TokenVersion: u.TokenVersion, AuthTime: at, SteppedUpAt: steppedUp}
}

// call sends a request as the console does: the session cookie, and the CSRF
// header on a mutation.
func call(t *testing.T, h http.Handler, method, path, body string, p auth.Principal, issuedAt time.Time) *httptest.ResponseRecorder {
	t.Helper()
	tok, _, err := auth.IssueSession(testSecret, p, issuedAt, auth.SessionAbsoluteLifetime)
	if err != nil {
		t.Fatal(err)
	}
	return callWith(h, method, path, body, tok, auth.CSRFToken(testSecret, p))
}

func callWith(h http.Handler, method, path, body, sessionTok, csrf string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: sessionTok})
	if csrf != "" {
		req.Header.Set(auth.CSRFHeader, csrf)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

// A5-08. Logout used to answer 204 and do nothing: the token stayed good for
// the rest of its 12 hours. Now the very cookie that signed out is refused on
// the next request, and the response tells the browser to drop it.
func TestLogout_RevokesTheSessionOnTheServer(t *testing.T) {
	store := consoleStore(t)
	h := consoleRouter(store, &fakeMFA{enrolled: true, acceptCode: "123456"})
	now := time.Now()
	p := signedIn(t, *store.user, now, time.Time{})
	tok, _, _ := auth.IssueSession(testSecret, p, now, auth.SessionAbsoluteLifetime)
	csrf := auth.CSRFToken(testSecret, p)

	if w := callWith(h, http.MethodGet, "/admin/v1/auth/me", "", tok, ""); w.Code != http.StatusOK {
		t.Fatalf("the session did not work before logout: %d", w.Code)
	}
	out := callWith(h, http.MethodPost, "/admin/v1/auth/logout", "", tok, csrf)
	if out.Code != http.StatusNoContent {
		t.Fatalf("logout answered %d %s", out.Code, out.Body.String())
	}
	if c := cookieNamed(out, auth.SessionCookieName); c == nil || c.MaxAge >= 0 {
		t.Fatalf("logout did not tell the browser to drop the session cookie: %v", out.Header().Values("Set-Cookie"))
	}
	// The copy an attacker lifted is the same bytes as the one the browser
	// dropped — the server is what has to refuse it.
	if w := callWith(h, http.MethodGet, "/admin/v1/auth/me", "", tok, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("the signed-out session still worked: %d", w.Code)
	}
}

// A6-12. The cookie rides on any request to the host, including one a page on
// another *.banzami.com host causes; SameSite=Strict does not stop a sibling
// subdomain. So a mutation without the session's CSRF token is refused.
func TestCSRF_AMutationWithoutTheTokenIsRefused(t *testing.T) {
	store := consoleStore(t)
	h := consoleRouter(store, &fakeMFA{enrolled: true, acceptCode: "123456"})
	now := time.Now()
	p := signedIn(t, *store.user, now, time.Time{})
	tok, _, _ := auth.IssueSession(testSecret, p, now, auth.SessionAbsoluteLifetime)

	for name, csrf := range map[string]string{
		"no token":    "",
		"wrong token": "not-the-token",
		// A token for a different sign-in of the same operator, as a planted
		// CSRF cookie would carry: bound to AuthTime, so it does not transfer.
		"another session's token": auth.CSRFToken(testSecret, signedIn(t, *store.user, now.Add(-time.Hour), time.Time{})),
	} {
		w := callWith(h, http.MethodPost, "/admin/v1/auth/logout", "", tok, csrf)
		if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "CSRF_REJECTED") {
			t.Fatalf("%s: a mutation was served (%d %s)", name, w.Code, w.Body.String())
		}
	}
	if store.user.TokenVersion != 3 {
		t.Fatal("a refused logout still revoked the session")
	}
	// Reads need no token: they change nothing, and SameSite plus same-origin
	// reading rules already keep their answers from another page.
	if w := callWith(h, http.MethodGet, "/admin/v1/auth/me", "", tok, ""); w.Code != http.StatusOK {
		t.Fatalf("a read was refused without a CSRF token: %d", w.Code)
	}
}

// A5-08. The highest-risk routes want a code proven within the last five
// minutes. A session without one — or with one that is too old — gets
// STEP_UP_REQUIRED, and the action does not run.
func TestStepUp_RequiredWhenAbsentOrExpired(t *testing.T) {
	store := consoleStore(t)
	h := consoleRouter(store, &fakeMFA{enrolled: true, acceptCode: "123456"})
	now := time.Now()
	for name, stepped := range map[string]time.Time{
		"never":       {},
		"6 min ago":   now.Add(-6 * time.Minute),
		"in a future": now.Add(10 * time.Minute),
	} {
		w := call(t, h, http.MethodPost, "/admin/v1/operators", `{}`, signedIn(t, *store.user, now.Add(-10*time.Minute), stepped), now)
		if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "STEP_UP_REQUIRED") {
			t.Fatalf("stepped up %s: the high-risk route answered %d %s", name, w.Code, w.Body.String())
		}
	}
	w := call(t, h, http.MethodPost, "/admin/v1/operators", `{}`, signedIn(t, *store.user, now.Add(-10*time.Minute), now.Add(-4*time.Minute)), now)
	if w.Code != http.StatusCreated {
		t.Fatalf("a step-up 4 minutes old was refused: %d %s", w.Code, w.Body.String())
	}
}

// The step-up itself: a correct code re-issues the session with a fresh
// SteppedUpAt, keeping when the operator signed in, and the high-risk route
// then runs with the cookie that came back.
func TestStepUp_ACorrectCodeOpensTheHighRiskRoutes(t *testing.T) {
	store := consoleStore(t)
	h := consoleRouter(store, &fakeMFA{enrolled: true, acceptCode: "123456"})
	now := time.Now()
	signIn := now.Add(-20 * time.Minute)
	p := signedIn(t, *store.user, signIn, time.Time{})

	w := call(t, h, http.MethodPost, "/admin/v1/auth/step-up", `{"code":"123456"}`, p, now)
	if w.Code != http.StatusOK {
		t.Fatalf("step-up refused a correct code: %d %s", w.Code, w.Body.String())
	}
	if n := len(w.Header().Values("Set-Cookie")); n != 2 {
		t.Fatalf("step-up sent %d Set-Cookie headers, want the session and CSRF cookie once each", n)
	}
	stepped := sessionFrom(t, w)
	if time.Since(stepped.SteppedUpAt) > time.Minute {
		t.Fatalf("the re-issued session carries SteppedUpAt %v", stepped.SteppedUpAt)
	}
	if stepped.AuthTime.Unix() != signIn.Unix() {
		t.Fatalf("step-up moved the sign-in time (%v → %v): the absolute lifetime would restart", signIn, stepped.AuthTime)
	}
	c := cookieNamed(w, auth.SessionCookieName)
	if got := callWith(h, http.MethodPost, "/admin/v1/operators", `{}`, c.Value, auth.CSRFToken(testSecret, stepped)); got.Code != http.StatusCreated {
		t.Fatalf("the stepped-up session was refused on a high-risk route: %d %s", got.Code, got.Body.String())
	}
}

// One code, once. A code accepted for a step-up is spent — the same code a
// second time is refused — which is what makes a code watched over a shoulder
// or replayed from a proxy log worthless. A wrong code is a 403 (the session
// is fine), never a 401 that the console would read as "signed out".
func TestStepUp_ACodeIsAcceptedOnce(t *testing.T) {
	store := consoleStore(t)
	mfa := &fakeMFA{enrolled: true, acceptCode: "123456"}
	h := consoleRouter(store, mfa)
	now := time.Now()
	p := signedIn(t, *store.user, now.Add(-time.Minute), time.Time{})

	if w := call(t, h, http.MethodPost, "/admin/v1/auth/step-up", `{"code":"123456"}`, p, now); w.Code != http.StatusOK {
		t.Fatalf("first use refused: %d", w.Code)
	}
	w := call(t, h, http.MethodPost, "/admin/v1/auth/step-up", `{"code":"123456"}`, p, now)
	if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "MFA_CODE_REJECTED") {
		t.Fatalf("a spent code stepped up again: %d %s", w.Code, w.Body.String())
	}
	if cookieNamed(w, auth.SessionCookieName) != nil && sessionFrom(t, w).SteppedUpAt.After(now.Add(-time.Second)) {
		t.Fatal("a refused code still produced a stepped-up session")
	}
}

// The step-up is a code-guessing surface inside a session, so it shares the
// account lock: five wrong codes lock the account and end every session it
// holds, this one included.
func TestStepUp_WrongCodesLockTheAccountAndEndTheSession(t *testing.T) {
	store := consoleStore(t)
	h := consoleRouter(store, &fakeMFA{enrolled: true, acceptCode: "123456"})
	now := time.Now()
	p := signedIn(t, *store.user, now.Add(-time.Minute), time.Time{})
	tok, _, _ := auth.IssueSession(testSecret, p, now, auth.SessionAbsoluteLifetime)
	csrf := auth.CSRFToken(testSecret, p)

	var last *httptest.ResponseRecorder
	for i := 0; i < service.MaxFailedLogins; i++ {
		last = callWith(h, http.MethodPost, "/admin/v1/auth/step-up", `{"code":"000000"}`, tok, csrf)
	}
	if last.Code != http.StatusTooManyRequests {
		t.Fatalf("the fifth wrong code did not lock the account: %d %s", last.Code, last.Body.String())
	}
	if store.user.TokenVersion != 4 {
		t.Fatalf("the lock did not revoke the account's sessions (token_version %d)", store.user.TokenVersion)
	}
	if w := callWith(h, http.MethodGet, "/admin/v1/auth/me", "", tok, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("the session survived the lock: %d", w.Code)
	}
}

// Sign-in with a code IS a fresh proof: the session /mfa/verify issues is
// stepped up, so the operator is not asked again for the next five minutes.
func TestMFAVerify_TheNewSessionIsSteppedUp(t *testing.T) {
	h, _, u := mfaFixture(t, true)
	w := post(h.Verify, tokenFor(t, u, auth.PurposeMFAChallenge), `{"code":"123456"}`)
	if p := sessionFrom(t, w); p.SteppedUpAt.IsZero() || p.AuthTime.IsZero() {
		t.Fatalf("verify issued SteppedUpAt=%v AuthTime=%v", p.SteppedUpAt, p.AuthTime)
	}
}
