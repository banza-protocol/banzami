package accountidentity

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	ce "github.com/banzami/banzami/services/common/email"
)

// A code the provider refused is not announced as sent (MONEY-MODEL-001 closure):
// the answer is a truthful 503 CODE_NOT_SENT, the same for every address, and
// names no provider.
func TestRequestOTP_DeliveryFailureIsNotAnnouncedAsSent(t *testing.T) {
	h, store, mail := newH(t, ServiceConfig{})
	mail.fail = &ce.ProviderError{Status: 429, Message: "You have reached your daily email sending quota."}
	_, _ = store.UpsertVerifiedUser(context.Background(), "known@x.co")
	r1 := do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"known@x.co"}`, origin(), nil)
	r2 := do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"unknown@x.co"}`, origin(), nil)
	for _, rr := range []int{r1.Code, r2.Code} {
		if rr != http.StatusServiceUnavailable {
			t.Fatalf("a refused send answered %d, want 503", rr)
		}
	}
	if r1.Body.String() != r2.Body.String() {
		t.Fatalf("the failure reveals existence: %q vs %q", r1.Body.String(), r2.Body.String())
	}
	var body struct {
		Error struct{ Code, Message string } `json:"error"`
	}
	_ = json.Unmarshal(r1.Body.Bytes(), &body)
	if body.Error.Code != "CODE_NOT_SENT" {
		t.Fatalf("code = %q, want CODE_NOT_SENT", body.Error.Code)
	}
	low := strings.ToLower(r1.Body.String())
	for _, leak := range []string{"resend", "quota", "429", "provider"} {
		if strings.Contains(low, leak) {
			t.Fatalf("public answer leaks %q: %s", leak, r1.Body.String())
		}
	}
	found := false
	for _, a := range store.Audits {
		if a.Action == "otp.delivery_failed" && a.Metadata["reason"] == ce.ReasonProviderQuotaExhausted {
			found = true
		}
	}
	if !found {
		t.Fatal("the operator cannot see why: no otp.delivery_failed audit with the quota reason")
	}
}

// Banzami's own fixture traffic has a daily budget; a real developer is never
// counted against it.
func TestRequestOTP_FixtureBudgetNeverTouchesRealDevelopers(t *testing.T) {
	h, _, mail := newH(t, ServiceConfig{FixtureEmailDailyBudget: 2})
	for i, addr := range []string{"a", "b"} {
		if rr := do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"e2e-`+addr+`@banzami-e2e.test"}`, origin(), nil); rr.Code != http.StatusOK {
			t.Fatalf("fixture %d within budget: %d", i, rr.Code)
		}
	}
	rr := do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"e2e-c@banzami-e2e.test"}`, origin(), nil)
	if rr.Code != http.StatusTooManyRequests || !strings.Contains(rr.Body.String(), "FIXTURE_EMAIL_BUDGET_EXHAUSTED") {
		t.Fatalf("over budget: %d %s", rr.Code, rr.Body.String())
	}
	sent := mail.n
	if rr := do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"developer@example.ao"}`, origin(), nil); rr.Code != http.StatusOK {
		t.Fatalf("a real developer was refused with the fixture budget spent: %d", rr.Code)
	}
	if mail.n != sent+1 {
		t.Fatal("the real developer's code was not sent")
	}
}

// A fixture session exists only for the fixture domain, only where fixtures are
// enabled, creates no OTP, and is audited.
func TestMintFixtureSession_BoundedToFixtures(t *testing.T) {
	store := NewMemStore()
	off := NewService(store, NewMemLimiter(), &fakeMailer{}, ServiceConfig{OTPPepper: "p", SessionSecret: "s"})
	if _, err := off.MintFixtureSession(context.Background(), "e2e-x@banzami-e2e.test", "r"); err != ErrNotFixture {
		t.Fatalf("fixtures disabled (Live): err = %v", err)
	}
	on := NewService(store, NewMemLimiter(), &fakeMailer{}, ServiceConfig{OTPPepper: "p", SessionSecret: "s", FixturesEnabled: true})
	for _, real := range []string{"developer@banzami.com", "e2e-x@banzami-e2e.test.evil.com", "e2e@banzami-e2e.testx", "x"} {
		if _, err := on.MintFixtureSession(context.Background(), real, "r"); err != ErrNotFixture {
			t.Fatalf("%q: err = %v, want ErrNotFixture", real, err)
		}
	}
	res, err := on.MintFixtureSession(context.Background(), " E2E-X@banzami-e2e.test ", "r")
	if err != nil {
		t.Fatal(err)
	}
	user, err := on.ValidateSession(context.Background(), res.SessionRaw)
	if err != nil || user.Email != "e2e-x@banzami-e2e.test" {
		t.Fatalf("session does not resolve to the fixture identity: %v %+v", err, user)
	}
	if len(store.otps) != 0 {
		t.Fatal("a fixture session must not create, read or bypass an OTP")
	}
	audited := false
	for _, a := range store.Audits {
		audited = audited || a.Action == "session.fixture_minted"
	}
	if !audited {
		t.Fatal("fixture session not audited")
	}
}

// No public capability discloses an OTP. request-otp's response never carries a
// code, a wrong verify never echoes one, and there is no peek route. (The
// fixture-session route mints a session, never a code, and is internal-only —
// see the server package.)
func TestNoPublicOTPDisclosure(t *testing.T) {
	h, store, mail := newH(t, ServiceConfig{})
	_, _ = store.UpsertVerifiedUser(context.Background(), "user@x.co")
	req := do(h.RequestOTP, "POST", "/auth/request-otp", `{"email":"user@x.co"}`, origin(), nil)
	code := mail.code
	if code == "" {
		t.Fatal("no code was generated to check against")
	}
	if strings.Contains(req.Body.String(), code) || sixDigits(req.Body.String()) {
		t.Fatalf("request-otp response discloses a code: %s", req.Body.String())
	}
	bad := do(h.Verify, "POST", "/auth/verify", `{"email":"user@x.co","code":"000000"}`, origin(), nil)
	if sixDigits(bad.Body.String()) {
		t.Fatalf("a failed verify echoes a code: %s", bad.Body.String())
	}
	// The public Register surface mounts no route whose name suggests a peek.
	var mounted []string
	get := func(p string, _ http.HandlerFunc) { mounted = append(mounted, "GET "+p) }
	post := func(p string, _ http.HandlerFunc) { mounted = append(mounted, "POST "+p) }
	h.Register(get, post)
	for _, r := range mounted {
		low := strings.ToLower(r)
		for _, banned := range []string{"otp-peek", "otp_peek", "__test__", "/peek", "reveal", "fixture-session"} {
			if strings.Contains(low, banned) {
				t.Fatalf("public route %q looks like an OTP/fixture bypass", r)
			}
		}
	}
}

func sixDigits(s string) bool {
	run := 0
	for _, c := range s {
		if c >= '0' && c <= '9' {
			run++
			if run >= 6 {
				return true
			}
		} else {
			run = 0
		}
	}
	return false
}
