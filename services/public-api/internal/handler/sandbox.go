package handler

import (
	"encoding/json"
	"github.com/banzami/banzami/services/common/env"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// sandboxFundDailyLimit is the maximum number of fund calls a single consumer
// may make in a 24-hour window. Prevents test infrastructure abuse.
const sandboxFundDailyLimit = 20

// SandboxHandler provides developer utilities for consumer integration testing.
// Every endpoint enforces that the service is deployed in SANDBOX environment.
type SandboxHandler struct {
	core        *service.CorePublicClient
	environment string // "PRODUCTION" or "SANDBOX"
	fundLimiter *TransferRateLimiter
}

// isSandboxEnvironment compares the deployment environment case-insensitively.
//
// The deployment sets ENVIRONMENT=sandbox (lowercase); this gate demanded the
// exact string "SANDBOX", so the Sandbox-only endpoints answered
// "403 SANDBOX_ONLY: this endpoint is only available in sandbox mode" — inside
// the Sandbox. Sandbox wallet funding was therefore unreachable, which blocks any
// assurance that needs a funded payer.
//
// Deliberately exact equality after folding case, never a prefix or substring
// match: a LIVE deployment sets a different word entirely, and it must keep
// failing this check. developer-api already accepts both spellings; this brings
// public-api into line rather than changing what "sandbox" means.
func isSandboxEnvironment(raw string) bool {
	return env.Parse(raw).IsSandbox()
}

func NewSandboxHandler(core *service.CorePublicClient, environment string) *SandboxHandler {
	return &SandboxHandler{
		core:        core,
		environment: environment,
		fundLimiter: NewTransferRateLimiter(sandboxFundDailyLimit, 24*time.Hour),
	}
}

func (h *SandboxHandler) requireSandbox(w http.ResponseWriter, r *http.Request) bool {
	if !isSandboxEnvironment(h.environment) {
		apierror.Respond(w, r, http.StatusForbidden, "SANDBOX_ONLY",
			"this endpoint is only available in sandbox mode")
		return false
	}
	return true
}

// POST /v1/sandbox/fund
//
// Credits the authenticated consumer's sandbox wallet with virtual funds.
// Capped at 100,000,000 AOA (10,000,000,000 minor units) per request.
func (h *SandboxHandler) FundWallet(w http.ResponseWriter, r *http.Request) {
	if !h.requireSandbox(w, r) {
		return
	}

	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "missing auth")
		return
	}

	if !h.fundLimiter.Allow(consumer.ID) {
		apierror.Respond(w, r, http.StatusTooManyRequests, "RATE_LIMITED",
			"sandbox fund limit reached — maximum 20 top-ups per 24 hours per consumer")
		return
	}

	var body struct {
		AmountMinor int64  `json:"amount_minor"`
		Currency    string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if body.AmountMinor <= 0 {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR",
			"amount_minor must be a positive integer in minor units")
		return
	}
	const maxFundMinor = 10_000_000_000 // 100,000,000 AOA
	if body.AmountMinor > maxFundMinor {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR",
			"sandbox top-up is capped at 100,000,000 AOA per request")
		return
	}
	if body.Currency == "" {
		body.Currency = "AOA"
	}

	// The client's Idempotency-Key makes a retried top-up the same top-up.
	newBalance, err := h.core.SandboxCreditConsumer(r.Context(), consumer.ID, body.AmountMinor, body.Currency, r.Header.Get("Idempotency-Key"))
	if err != nil {
		if strings.Contains(err.Error(), "core-api error 409") {
			apierror.Respond(w, r, http.StatusConflict, "IDEMPOTENCY_KEY_REUSED",
				"this Idempotency-Key was already used for a different top-up")
			return
		}
		if strings.Contains(err.Error(), "core-api error 400") {
			apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "the top-up request was refused")
			return
		}
		if code, ok := sandboxCreditRefusal(err); ok {
			apierror.Respond(w, r, http.StatusUnprocessableEntity, code, "the Sandbox refused this top-up: "+code)
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "the sandbox top-up could not be applied")
		return
	}

	respond(w, http.StatusOK, map[string]any{
		"funded":         true,
		"currency":       body.Currency,
		"credited_minor": body.AmountMinor,
		"new_balance":    newBalance,
		"note":           "Sandbox wallet credited. Virtual balance — no real funds moved.",
	})
}

// sandboxCreditRefusal recognises core's deliberate refusal of a top-up (a
// 422 with a code — e.g. PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED once the Sandbox
// pilot cap is reached) so the caller is told which rule refused it. It was
// answered as a 500, "could not be applied", which reads as an outage and
// hides the one thing the caller can act on.
func sandboxCreditRefusal(err error) (string, bool) {
	if err == nil || !strings.Contains(err.Error(), "core-api error 422") {
		return "", false
	}
	m := coreErrorCode.FindStringSubmatch(err.Error())
	if m == nil {
		return "SANDBOX_CREDIT_REFUSED", true
	}
	return m[1], true
}

var coreErrorCode = regexp.MustCompile(`"code"\s*:\s*"([A-Z0-9_]{1,64})"`)
