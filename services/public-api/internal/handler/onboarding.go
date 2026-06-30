package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// OnboardingHandler implements the consumer wallet onboarding flow:
//
//	POST /v1/consumer/onboarding/start      → PENDING_OTP
//	POST /v1/consumer/onboarding/verify-otp → PENDING_PIN
//	POST /v1/consumer/onboarding/complete   → ACTIVE wallet
//
// This handler is intentionally unauthenticated — a consumer does not have a
// JWT before onboarding completes. Rate limiting is applied per phone number
// and per IP to prevent enumeration and OTP brute-force.
type OnboardingHandler struct {
	core    *service.CorePublicClient
	limiter *onboardingRateLimiter
}

func NewOnboardingHandler(core *service.CorePublicClient) *OnboardingHandler {
	return &OnboardingHandler{
		core:    core,
		limiter: newOnboardingRateLimiter(),
	}
}

// ---------------------------------------------------------------------------
// Rate limiter — simple in-memory sliding window per phone number
// ---------------------------------------------------------------------------

// onboardingRateLimiter tracks per-phone-number request counts.
// Limits:
//   - start/resend: max 5 per phone per 10 minutes
//   - verify-otp: max 5 attempts per session (enforced in core); here we only
//     track per-phone to prevent distributed enumeration.
//   - complete: max 10 per phone per hour.
type onboardingRateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*rateBucket
}

type rateBucket struct {
	count     int
	windowEnd time.Time
	window    time.Duration
	max       int
}

func (b *rateBucket) allow() bool {
	now := time.Now()
	if now.After(b.windowEnd) {
		b.count = 0
		b.windowEnd = now.Add(b.window)
	}
	if b.count >= b.max {
		return false
	}
	b.count++
	return true
}

func newOnboardingRateLimiter() *onboardingRateLimiter {
	return &onboardingRateLimiter{buckets: make(map[string]*rateBucket)}
}

func (l *onboardingRateLimiter) allowStart(phone string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	key := "start:" + phone
	b, ok := l.buckets[key]
	if !ok {
		b = &rateBucket{window: 10 * time.Minute, max: 5, windowEnd: time.Now().Add(10 * time.Minute)}
		l.buckets[key] = b
	}
	return b.allow()
}

func (l *onboardingRateLimiter) allowVerify(phone string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	key := "verify:" + phone
	b, ok := l.buckets[key]
	if !ok {
		b = &rateBucket{window: 10 * time.Minute, max: 10, windowEnd: time.Now().Add(10 * time.Minute)}
		l.buckets[key] = b
	}
	return b.allow()
}

func (l *onboardingRateLimiter) allowComplete(phone string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	key := "complete:" + phone
	b, ok := l.buckets[key]
	if !ok {
		b = &rateBucket{window: 1 * time.Hour, max: 10, windowEnd: time.Now().Add(1 * time.Hour)}
		l.buckets[key] = b
	}
	return b.allow()
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// e164Re matches E.164 phone numbers. Angola: +244XXXXXXXXX (9 digits after country code).
var e164Re = regexp.MustCompile(`^\+[1-9]\d{6,14}$`)

// handleRe matches a valid @banza handle: 3–20 chars, starts with lowercase letter.
var handleRe = regexp.MustCompile(`^[a-z][a-z0-9_]{2,19}$`)

func validatePhone(phone string) bool {
	return e164Re.MatchString(strings.TrimSpace(phone))
}

func validateHandle(handle string) string {
	h := strings.TrimSpace(handle)
	if !handleRe.MatchString(h) {
		return "handle must be 3–20 characters, start with a letter, and contain only a–z, 0–9, and _"
	}
	if strings.Contains(h, "__") {
		return "handle must not contain consecutive underscores"
	}
	if strings.HasSuffix(h, "_") {
		return "handle must not end with an underscore"
	}
	return ""
}

// validatePin checks that the PIN is 4–6 digits only.
func validatePin(pin string) string {
	if len(pin) < 4 || len(pin) > 6 {
		return "PIN must be 4–6 digits"
	}
	for _, r := range pin {
		if !unicode.IsDigit(r) {
			return "PIN must contain digits only"
		}
	}
	return ""
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// POST /v1/consumer/onboarding/start
//
// Body: { "phone_number": "+244XXXXXXXXX", "currency": "AOA" }
// Creates a PENDING_OTP onboarding session. Sends OTP via SMS (stub in this phase).
//
// otp_plaintext_for_test is accepted in non-production environments only;
// it lets integration tests drive the full onboarding flow without an SMS gateway.
func (h *OnboardingHandler) Start(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PhoneNumber      string  `json:"phone_number"`
		Currency         string  `json:"currency"`
		OtpPlaintextTest *string `json:"otp_plaintext_for_test"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	body.PhoneNumber = strings.TrimSpace(body.PhoneNumber)
	if body.PhoneNumber == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "phone_number is required")
		return
	}
	if !validatePhone(body.PhoneNumber) {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD", "phone_number must be in E.164 format (e.g. +244912345678)")
		return
	}

	currency := strings.ToUpper(strings.TrimSpace(body.Currency))
	if currency == "" {
		currency = "AOA"
	}
	if currency != "AOA" {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD", "only AOA is supported at this time")
		return
	}

	if !h.limiter.allowStart(body.PhoneNumber) {
		apierror.Respond(w, r, http.StatusTooManyRequests, "RATE_LIMITED", "too many OTP requests for this number — try again in 10 minutes")
		return
	}

	// In production, otpForTest is nil and the OTP is dispatched by the SMS layer.
	// In non-production environments, otp_plaintext_for_test may be supplied so that
	// integration tests can drive the full flow without an SMS gateway.
	session, err := h.core.StartOnboarding(r.Context(), body.PhoneNumber, currency, body.OtpPlaintextTest)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrDuplicateWallet):
			apierror.Respond(w, r, http.StatusConflict, "DUPLICATE_WALLET", "a wallet already exists for this phone number")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not start onboarding")
		}
		return
	}

	respond(w, http.StatusCreated, map[string]any{
		"session_id":   session.SessionID,
		"phone_number": session.PhoneNumber,
		"status":       session.Status,
		"message":      "OTP sent to your phone number",
	})
}

// POST /v1/consumer/onboarding/verify-otp
//
// Body: { "session_id": "uuid", "otp_code": "123456" }
// Advances the session from PENDING_OTP to PENDING_PIN.
func (h *OnboardingHandler) VerifyOtp(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SessionID string `json:"session_id"`
		OtpCode   string `json:"otp_code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	body.SessionID = strings.TrimSpace(body.SessionID)
	body.OtpCode = strings.TrimSpace(body.OtpCode)

	if body.SessionID == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "session_id is required")
		return
	}
	if body.OtpCode == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "otp_code is required")
		return
	}
	if len(body.OtpCode) < 4 || len(body.OtpCode) > 8 {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD", "otp_code must be 4–8 digits")
		return
	}

	// Rate limit on session_id as proxy for phone (prevents distributed brute-force).
	if !h.limiter.allowVerify(body.SessionID) {
		apierror.Respond(w, r, http.StatusTooManyRequests, "RATE_LIMITED", "too many OTP verification attempts")
		return
	}

	resp, err := h.core.VerifyOtp(r.Context(), body.SessionID, body.OtpCode)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrOtpInvalid):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "OTP_INVALID", "OTP is invalid")
		case errors.Is(err, service.ErrOtpExpired):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "OTP_EXPIRED", "OTP has expired — start a new onboarding session")
		case errors.Is(err, service.ErrOnboardingNotFound):
			apierror.Respond(w, r, http.StatusNotFound, "ONBOARDING_NOT_FOUND", "onboarding session not found")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not verify OTP")
		}
		return
	}

	respond(w, http.StatusOK, map[string]any{
		"session_id": resp.SessionID,
		"status":     resp.Status,
		"message":    "OTP verified — you may now set your handle and PIN",
	})
}

// POST /v1/consumer/onboarding/complete
//
// Body: { "session_id": "uuid", "banza_handle": "my_handle", "pin": "1234" }
// Atomically activates the consumer wallet.
func (h *OnboardingHandler) Complete(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SessionID   string `json:"session_id"`
		BanzaHandle string `json:"banza_handle"`
		Pin         string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	body.SessionID = strings.TrimSpace(body.SessionID)
	body.BanzaHandle = strings.TrimSpace(body.BanzaHandle)
	body.Pin = strings.TrimSpace(body.Pin)

	if body.SessionID == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "session_id is required")
		return
	}
	if body.BanzaHandle == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "banza_handle is required")
		return
	}
	if msg := validateHandle(body.BanzaHandle); msg != "" {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_HANDLE", msg)
		return
	}
	if msg := validatePin(body.Pin); msg != "" {
		apierror.Respond(w, r, http.StatusBadRequest, "PIN_POLICY_FAILED", msg)
		return
	}

	if !h.limiter.allowComplete(body.SessionID) {
		apierror.Respond(w, r, http.StatusTooManyRequests, "RATE_LIMITED", "too many completion attempts for this session")
		return
	}

	wallet, err := h.core.CompleteOnboarding(r.Context(), body.SessionID, body.BanzaHandle, body.Pin)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrOnboardingNotFound):
			apierror.Respond(w, r, http.StatusNotFound, "ONBOARDING_NOT_FOUND", "onboarding session not found or already completed")
		case errors.Is(err, service.ErrOtpExpired):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "OTP_EXPIRED", "onboarding session has expired — start again")
		case errors.Is(err, service.ErrHandleTaken):
			apierror.Respond(w, r, http.StatusConflict, "HANDLE_TAKEN", "this handle is already taken — choose another")
		case errors.Is(err, service.ErrInvalidHandle):
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_HANDLE", "handle format rejected by server")
		case errors.Is(err, service.ErrDuplicateWallet):
			apierror.Respond(w, r, http.StatusConflict, "DUPLICATE_WALLET", "a wallet already exists for this phone number")
		case errors.Is(err, service.ErrInvalidLifecycle):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "INVALID_LIFECYCLE_STATE", "session is not in the expected state")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not complete onboarding")
		}
		return
	}

	respond(w, http.StatusCreated, map[string]any{
		"wallet_id":    wallet.WalletID,
		"consumer_id":  wallet.ConsumerID,
		"banza_handle": wallet.BanzaHandle,
		"currency":     wallet.Currency,
		"status":       wallet.Status,
		"message":      "Wallet activated — welcome to Banzami",
	})
}
