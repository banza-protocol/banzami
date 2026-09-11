package accountidentity

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const testOrigin = "https://developers.banzami.com"

type fakeMailer struct {
	to, code string
	n        int
}

func (f *fakeMailer) SendVerificationCode(to, code string) { f.to, f.code, f.n = to, code, f.n+1 }

func newH(t *testing.T, cfg ServiceConfig) (*Handlers, *memStore, *fakeMailer) {
	t.Helper()
	if cfg.OTPPepper == "" {
		cfg.OTPPepper = "otp-pepper"
	}
	if cfg.SessionSecret == "" {
		cfg.SessionSecret = "session-secret"
	}
	store := NewMemStore()
	mail := &fakeMailer{}
	svc := NewService(store, NewMemLimiter(), mail, cfg)
	// secure=true → __Host- cookie (the production cookie shape we assert on).
	return NewHandlers(svc, testOrigin, true), store, mail
}

func do(h http.HandlerFunc, method, target, body string, headers map[string]string, cookies []*http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rr := httptest.NewRecorder()
	h(rr, req)
	return rr
}

func origin() map[string]string { return map[string]string{"Origin": testOrigin} }

// ── Origin enforcement ───────────────────────────────────────────────────────

func TestRequestOTP_OriginEnforced(t *testing.T) {
	h, _, _ := newH(t, ServiceConfig{})
	// Missing/wrong Origin → 403.
	if rr := do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"a@x.co"}`, nil, nil); rr.Code != http.StatusForbidden {
		t.Fatalf("no Origin: want 403, got %d", rr.Code)
	}
	if rr := do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"a@x.co"}`, map[string]string{"Origin": "https://evil.com"}, nil); rr.Code != http.StatusForbidden {
		t.Fatalf("bad Origin: want 403, got %d", rr.Code)
	}
	// Correct Origin → 200.
	if rr := do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"a@x.co"}`, origin(), nil); rr.Code != http.StatusOK {
		t.Fatalf("good Origin: want 200, got %d", rr.Code)
	}
}

// ── Anti-enumeration: uniform response regardless of account existence ────────

func TestRequestOTP_UniformResponse(t *testing.T) {
	h, store, _ := newH(t, ServiceConfig{})
	// Pre-create one user; the other email is unknown. Both must respond 200.
	_, _ = store.UpsertVerifiedUser(nil, "known@x.co")
	r1 := do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"known@x.co"}`, origin(), nil)
	r2 := do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"unknown@x.co"}`, origin(), nil)
	if r1.Code != http.StatusOK || r2.Code != http.StatusOK {
		t.Fatalf("responses differ: known=%d unknown=%d", r1.Code, r2.Code)
	}
	if r1.Body.String() != r2.Body.String() {
		t.Fatalf("bodies differ, reveals existence: %q vs %q", r1.Body.String(), r2.Body.String())
	}
}

// ── Happy path + host-only cookie shape ──────────────────────────────────────

func TestVerify_SetsHostOnlyCookie(t *testing.T) {
	h, store, mail := newH(t, ServiceConfig{})
	do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"Dev@X.co"}`, origin(), nil)
	if mail.code == "" {
		t.Fatal("no OTP delivered")
	}
	rr := do(h.Verify, "POST", "/auth/verify", `{"email":"dev@x.co","code":"`+mail.code+`"}`, origin(), nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("verify: want 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	cs := rr.Result().Cookies()
	if len(cs) != 1 {
		t.Fatalf("want 1 cookie, got %d", len(cs))
	}
	c := cs[0]
	if c.Name != "__Host-bz_dev_session" {
		t.Errorf("cookie name = %q, want __Host- prefix", c.Name)
	}
	if !c.HttpOnly || !c.Secure {
		t.Errorf("cookie must be HttpOnly+Secure; got HttpOnly=%v Secure=%v", c.HttpOnly, c.Secure)
	}
	if c.SameSite != http.SameSiteLaxMode {
		t.Errorf("cookie SameSite = %v, want Lax", c.SameSite)
	}
	if c.Path != "/" {
		t.Errorf("cookie Path = %q, want /", c.Path)
	}
	if c.Domain != "" {
		t.Errorf("cookie must be host-only (no Domain); got Domain=%q", c.Domain)
	}
	// Case-insensitive email → same account.
	if _, ok := store.userByEmail("dev@x.co"); !ok {
		t.Error("verified user not created under canonical email")
	}
}

// ── OTP verify: wrong code, attempt ceiling, one-time use ─────────────────────

func TestVerify_WrongCodeThenAttemptCeiling(t *testing.T) {
	h, _, mail := newH(t, ServiceConfig{})
	do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"a@x.co"}`, origin(), nil)
	good := mail.code
	bad := "000000"
	if bad == good {
		bad = "111111"
	}
	for i := 0; i < 5; i++ {
		if rr := do(h.Verify, "POST", "/auth/verify", `{"email":"a@x.co","code":"`+bad+`"}`, origin(), nil); rr.Code != http.StatusUnauthorized {
			t.Fatalf("wrong code attempt %d: want 401, got %d", i, rr.Code)
		}
	}
	// After max attempts the (now-correct) code is refused too.
	if rr := do(h.Verify, "POST", "/auth/verify", `{"email":"a@x.co","code":"`+good+`"}`, origin(), nil); rr.Code != http.StatusUnauthorized {
		t.Fatalf("post-ceiling: want 401, got %d", rr.Code)
	}
}

func TestVerify_OneTimeUse(t *testing.T) {
	h, _, mail := newH(t, ServiceConfig{})
	do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"a@x.co"}`, origin(), nil)
	code := mail.code
	if rr := do(h.Verify, "POST", "/auth/verify", `{"email":"a@x.co","code":"`+code+`"}`, origin(), nil); rr.Code != http.StatusOK {
		t.Fatalf("first verify: want 200, got %d", rr.Code)
	}
	if rr := do(h.Verify, "POST", "/auth/verify", `{"email":"a@x.co","code":"`+code+`"}`, origin(), nil); rr.Code == http.StatusOK {
		t.Fatal("consumed code must not verify twice")
	}
}

// ── Abuse: per-IP rate limit + resend cooldown ───────────────────────────────

func TestRequestOTP_PerIPRateLimit(t *testing.T) {
	h, _, _ := newH(t, ServiceConfig{PerIPLimit: 3, ResendCooldown: time.Nanosecond, RateWindow: time.Minute})
	hdr := map[string]string{"Origin": testOrigin}
	// Different emails (no per-email cooldown collision) → exercises per-IP cap.
	emails := []string{"a@x.co", "b@x.co", "c@x.co", "d@x.co"}
	var codes []int
	for _, e := range emails {
		codes = append(codes, do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"`+e+`"}`, hdr, nil).Code)
	}
	if codes[0] != 200 || codes[1] != 200 || codes[2] != 200 {
		t.Fatalf("first 3 within limit should be 200: %v", codes)
	}
	if codes[3] != http.StatusTooManyRequests {
		t.Fatalf("4th over per-IP limit: want 429, got %d", codes[3])
	}
}

// A9-09: the per-IP cap keys on the client the service resolved (RemoteAddr),
// not on an X-Forwarded-For the caller writes. Rotating it from one address
// bought a fresh allowance per request.
func TestRequestOTP_PerIPRateLimit_IgnoresForwardedFor(t *testing.T) {
	h, _, _ := newH(t, ServiceConfig{PerIPLimit: 3, ResendCooldown: time.Nanosecond, RateWindow: time.Minute})
	var codes []int
	for i, e := range []string{"a@x.co", "b@x.co", "c@x.co", "d@x.co"} {
		hdr := map[string]string{"Origin": testOrigin, "X-Forwarded-For": fmt.Sprintf("198.51.100.%d", i+1), "X-Real-IP": fmt.Sprintf("198.51.100.%d", i+1)}
		codes = append(codes, doFrom("203.0.113.9:4000", h.RequestOTP, `{"email":"`+e+`"}`, hdr).Code)
	}
	if codes[3] != http.StatusTooManyRequests {
		t.Fatalf("4th request from one address with a new X-Forwarded-For: want 429, got %v", codes)
	}
}

// A9-04: an IPv6 client rotating through its own /64 is one client.
func TestRequestOTP_PerIPRateLimit_IPv6Per64(t *testing.T) {
	h, _, _ := newH(t, ServiceConfig{PerIPLimit: 3, ResendCooldown: time.Nanosecond, RateWindow: time.Minute})
	var codes []int
	for i, e := range []string{"a@x.co", "b@x.co", "c@x.co", "d@x.co"} {
		codes = append(codes, doFrom(fmt.Sprintf("[2001:db8:44:1::%x]:443", i+1), h.RequestOTP, `{"email":"`+e+`"}`, origin()).Code)
	}
	if codes[3] != http.StatusTooManyRequests {
		t.Fatalf("4th request from a fresh address in the same /64: want 429, got %v", codes)
	}
	if rr := doFrom("[2001:db8:44:2::1]:443", h.RequestOTP, `{"email":"e@x.co"}`, origin()); rr.Code != http.StatusOK {
		t.Fatalf("the neighbouring /64 was limited: %d", rr.Code)
	}
}

// doFrom is do with the client address the service's clientip middleware
// would have left in RemoteAddr.
func doFrom(remote string, h http.HandlerFunc, body string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", "/auth/request-otp", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = remote
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rr := httptest.NewRecorder()
	h(rr, req)
	return rr
}

func TestRequestOTP_ResendCooldown(t *testing.T) {
	h, _, _ := newH(t, ServiceConfig{ResendCooldown: time.Hour, PerEmailLimit: 100, PerIPLimit: 100, RateWindow: time.Minute})
	first := do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"a@x.co"}`, origin(), nil)
	second := do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"a@x.co"}`, origin(), nil)
	if first.Code != http.StatusOK {
		t.Fatalf("first: want 200, got %d", first.Code)
	}
	if second.Code != http.StatusTooManyRequests {
		t.Fatalf("resend within cooldown: want 429, got %d", second.Code)
	}
}

// ── Session: /me, logout, CSRF, server-side revoke ───────────────────────────

func login(t *testing.T, h *Handlers, mail *fakeMailer, email string) (*http.Cookie, string) {
	t.Helper()
	do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"`+email+`"}`, origin(), nil)
	rr := do(h.Verify, "POST", "/auth/verify", `{"email":"`+email+`","code":"`+mail.code+`"}`, origin(), nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("login verify failed: %d", rr.Code)
	}
	var csrf string
	body := rr.Body.String()
	if i := strings.Index(body, `"csrf_token":"`); i >= 0 {
		rest := body[i+len(`"csrf_token":"`):]
		csrf = rest[:strings.IndexByte(rest, '"')]
	}
	return rr.Result().Cookies()[0], csrf
}

func TestMe_RequiresSession(t *testing.T) {
	h, _, mail := newH(t, ServiceConfig{})
	if rr := do(h.Me, "GET", "/auth/me", "", nil, nil); rr.Code != http.StatusUnauthorized {
		t.Fatalf("no session: want 401, got %d", rr.Code)
	}
	cookie, _ := login(t, h, mail, "a@x.co")
	rr := do(h.Me, "GET", "/auth/me", "", nil, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("with session: want 200, got %d", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), "a@x.co") {
		t.Error("/auth/me should return the user email")
	}
}

func TestLogout_RequiresCSRF_AndRevokes(t *testing.T) {
	h, store, mail := newH(t, ServiceConfig{})
	cookie, csrf := login(t, h, mail, "a@x.co")

	// Logout without CSRF header → 403.
	if rr := do(h.Logout, "POST", "/auth/logout", "", origin(), []*http.Cookie{cookie}); rr.Code != http.StatusForbidden {
		t.Fatalf("logout w/o CSRF: want 403, got %d", rr.Code)
	}
	// Session still valid.
	if rr := do(h.Me, "GET", "/auth/me", "", nil, []*http.Cookie{cookie}); rr.Code != http.StatusOK {
		t.Fatalf("session should survive failed logout: got %d", rr.Code)
	}
	// Logout with CSRF → 200, cookie cleared, session revoked server-side.
	hdr := map[string]string{"Origin": testOrigin, "X-CSRF-Token": csrf}
	rr := do(h.Logout, "POST", "/auth/logout", "", hdr, []*http.Cookie{cookie})
	if rr.Code != http.StatusOK {
		t.Fatalf("logout w/ CSRF: want 200, got %d", rr.Code)
	}
	if got := rr.Result().Cookies()[0]; got.MaxAge >= 0 && got.Value != "" {
		t.Error("logout must clear the session cookie")
	}
	if rr := do(h.Me, "GET", "/auth/me", "", nil, []*http.Cookie{cookie}); rr.Code != http.StatusUnauthorized {
		t.Fatalf("revoked session must 401: got %d", rr.Code)
	}
	_ = store
}

// ── No raw OTP codes or session tokens are ever persisted ────────────────────

func TestNoRawSecretsPersisted(t *testing.T) {
	h, store, mail := newH(t, ServiceConfig{OTPPepper: "P", SessionSecret: "S"})
	cookie, _ := login(t, h, mail, "a@x.co")
	rawCode := mail.code
	rawToken := cookie.Value

	for _, o := range store.otps {
		if o.codeHash == rawCode {
			t.Error("OTP stored in plaintext")
		}
		if o.codeHash != hashOTP(rawCode, "P") {
			t.Error("OTP not stored as HMAC(code, pepper)")
		}
	}
	if _, ok := store.sessions[rawToken]; ok {
		t.Error("session stored under the raw token")
	}
	if _, ok := store.sessions[hashToken(rawToken, "S")]; !ok {
		t.Error("session must be keyed by HMAC(token, secret)")
	}
	// Audit events must not carry raw code or token.
	for _, ev := range store.Audits {
		for _, v := range ev.Metadata {
			if v == rawCode {
				t.Error("audit metadata leaked the raw OTP code")
			}
		}
		if strings.Contains(ev.Subject, rawCode) || strings.Contains(ev.Subject, rawToken) {
			t.Error("audit subject leaked a secret")
		}
	}
}
