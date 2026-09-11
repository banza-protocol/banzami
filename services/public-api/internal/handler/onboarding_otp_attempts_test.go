package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/public-api/internal/service"
)

// Core spends an onboarding code after five guesses and answers 429
// TOO_MANY_ATTEMPTS. public-api knew only OTP_INVALID and OTP_EXPIRED, so the
// app was told the service had failed (500) instead of "start again".
func TestVerifyOtp_ASpentCodeIsTooManyAttempts(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"code":"TOO_MANY_ATTEMPTS","message":"this code has had too many attempts"}`))
	}))
	defer core.Close()

	h := NewOnboardingHandler(service.NewCorePublicClient(core.URL))
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/consumer/onboarding/verify-otp",
		strings.NewReader(`{"session_id":"0b7d6f2e-1111-4c1a-9d6e-2a3b4c5d6e7f","otp_code":"123456"}`))
	h.VerifyOtp(rec, req)
	if rec.Code != http.StatusTooManyRequests || !strings.Contains(rec.Body.String(), `"TOO_MANY_ATTEMPTS"`) {
		t.Fatalf("a spent code was answered %d %s", rec.Code, rec.Body.String())
	}
}
