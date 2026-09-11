package accountidentity

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"
	"time"
)

// downLimiter is Redis unreachable: every call errors.
type downLimiter struct{}

func (downLimiter) Allow(context.Context, string, int, time.Duration) (bool, error) {
	return false, errors.New("dial tcp 10.0.0.9:6379: connect: connection refused")
}
func (downLimiter) Cooldown(context.Context, string, time.Duration) (bool, time.Duration, error) {
	return false, 0, errors.New("dial tcp 10.0.0.9:6379: connect: connection refused")
}

// A2-23 — the per-IP ceiling on email-code verification was skipped whenever
// Redis errored: during an outage one address could try codes without limit
// (each code's own attempt limit still applied). The count now falls back to
// an in-process window.
func TestVerify_PerIPCeilingHoldsWhenRedisIsDown(t *testing.T) {
	svc := NewService(NewMemStore(), downLimiter{}, &fakeMailer{}, ServiceConfig{
		OTPPepper: "otp-pepper", SessionSecret: "session-secret", PerIPLimit: 3, RateWindow: time.Minute,
	})
	h := NewHandlers(svc, testOrigin, true)
	hdr := map[string]string{"Origin": testOrigin, "X-Forwarded-For": "203.0.113.9"}
	var codes []int
	for i := 0; i < 6; i++ {
		// A different email each time, so no per-code attempt limit is involved.
		body := fmt.Sprintf(`{"email":"u%d@x.co","code":"000000"}`, i)
		codes = append(codes, do(h.Verify, "POST", "/auth/verify", body, hdr, nil).Code)
	}
	for i := 0; i < 3; i++ {
		if codes[i] != http.StatusUnauthorized {
			t.Fatalf("attempt %d within the ceiling: want 401 (wrong code), got %d — %v", i, codes[i], codes)
		}
	}
	for i := 3; i < 6; i++ {
		if codes[i] != http.StatusTooManyRequests {
			t.Fatalf("attempt %d over the per-IP ceiling with Redis down: want 429, got %d — %v", i, codes[i], codes)
		}
	}
}

// revokeFails is a store whose session revocation can be made to fail.
type revokeFails struct {
	*memStore
	fail bool
}

func (s *revokeFails) RevokeSessionByHash(ctx context.Context, hash string) error {
	if s.fail {
		return errors.New("failed to connect to `host=db`: dial tcp 10.0.0.5:5432: connect: connection refused")
	}
	return s.memStore.RevokeSessionByHash(ctx, hash)
}

// A2-24 — logout answered 200 and cleared the cookie even when the session
// could not be revoked: the Console said "signed out" while the token stayed
// live server-side. It is now 503, the cookie is kept so the person can sign
// out again, and the session is (truthfully) still valid.
func TestLogout_RevocationFailureIsNotASignOut(t *testing.T) {
	store := &revokeFails{memStore: NewMemStore()}
	mail := &fakeMailer{}
	h := NewHandlers(NewService(store, NewMemLimiter(), mail, ServiceConfig{OTPPepper: "otp-pepper", SessionSecret: "session-secret"}), testOrigin, true)
	cookie, csrf := login(t, h, mail, "a@x.co")

	store.fail = true
	hdr := map[string]string{"Origin": testOrigin, "X-CSRF-Token": csrf}
	rr := do(h.Logout, "POST", "/auth/logout", "", hdr, []*http.Cookie{cookie})
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("logout with a failed revocation: want 503, got %d (%s)", rr.Code, rr.Body.String())
	}
	if len(rr.Result().Cookies()) != 0 {
		t.Fatal("the cookie was cleared although the session is still live")
	}

	// Once the store answers, the same cookie signs out for real.
	store.fail = false
	if rr := do(h.Logout, "POST", "/auth/logout", "", hdr, []*http.Cookie{cookie}); rr.Code != http.StatusOK {
		t.Fatalf("retry: want 200, got %d", rr.Code)
	}
	if rr := do(h.Me, "GET", "/auth/me", "", nil, []*http.Cookie{cookie}); rr.Code != http.StatusUnauthorized {
		t.Fatalf("revoked session must 401: got %d", rr.Code)
	}
}
