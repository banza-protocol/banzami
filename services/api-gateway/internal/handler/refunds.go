package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// Public refund source vocabulary — the BANZA ADR-017 canonical names. These are
// operator-facing; the mapping to the core vocabulary is explicit + validated.
const (
	sourceAcquiring = "ACQUIRING_PAYMENT"
	sourceWallet    = "WALLET_PAYMENT"
)

var currencyRe = regexp.MustCompile(`^[A-Z]{3}$`)

// coreSourceType maps the public typed source to the core vocabulary. There is
// NO silent default: an empty/unknown value is rejected by the caller.
func coreSourceType(public string) (string, bool) {
	switch public {
	case sourceAcquiring:
		return "TRANSACTION", true // ADR-030 §2: ACQUIRING_PAYMENT a.k.a. TRANSACTION
	case sourceWallet:
		return "WALLET_PAYMENT", true
	default:
		return "", false
	}
}

// publicizeRefund normalizes a Core refund into the PUBLIC vocabulary before it
// leaves the gateway. The Core persists TRANSACTION as the bounded acquiring
// compatibility token (pending BANZA clarification); the public API only ever
// exposes ACQUIRING_PAYMENT / WALLET_PAYMENT. The internal token is never
// surfaced to developers. WALLET_PAYMENT passes through unchanged. This maps only
// the response representation — Core persistence is untouched.
func publicizeRefund(r *service.Refund) {
	if r != nil && r.SourceType == "TRANSACTION" {
		r.SourceType = sourceAcquiring
	}
}

type RefundHandler struct {
	svc service.RefundService
}

// NewRefundHandler wires the refund proxy. Proof-state correction is NOT done
// here: the Rust Core owns it (Banzami ADR-034 — a source proof stays CONFIRMED
// after a partial restitution and becomes REVERSED only when cumulative
// restitution equals the captured amount). The gateway must never flip the
// proof itself, or a partial refund would wrongly read as REVERSED.
func NewRefundHandler(svc service.RefundService) *RefundHandler {
	return &RefundHandler{svc: svc}
}

// POST /v1/refunds
//
// Refunds a TYPED source (BANZA ADR-017) — never a generic transfer, never an
// inferred source. The caller MUST specify source_type + source_id explicitly.
// resolveRefundAuthority answers "whose payment is being refunded?" for either
// credential.
//
// A refund is a financial write that moves money back out. Knowing a payment id
// is not authority over it, so the merchant is never taken from the request: a
// developer key's comes from its Project binding, a merchant JWT names itself.
// Core independently re-checks that the source belongs to that merchant and is
// eligible, so a bypass here still meets a refusal there.
func (h *RefundHandler) resolveRefundAuthority(w http.ResponseWriter, r *http.Request, scope string) (string, bool) {
	if dp, isDev := middleware.GetDeveloperPrincipal(r.Context()); isDev {
		if !dp.HasScope(scope) {
			apierror.Respond(w, r, http.StatusForbidden, "INSUFFICIENT_SCOPE",
				"missing required scope: "+scope)
			return "", false
		}
		// Refunding requires a financial owner. An unbound project has none.
		if !dp.Bound || dp.MerchantID == "" {
			apierror.Respond(w, r, http.StatusForbidden, "PAYMENTS_UNAVAILABLE",
				"this project is not provisioned to hold funds")
			return "", false
		}
		return dp.MerchantID, true
	}
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid merchant credentials required")
		return "", false
	}
	return principal.MerchantID, true
}

func (h *RefundHandler) Create(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.resolveRefundAuthority(w, r, "refunds:write")
	if !ok {
		return
	}

	var body struct {
		SourceType     string `json:"source_type"`
		SourceID       string `json:"source_id"`
		AmountMinor    int64  `json:"amount_minor"`
		Currency       string `json:"currency"`
		Reason         string `json:"reason"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	// --- Typed-source validation matrix (no ambiguity, no silent default) ---
	switch {
	case body.SourceType == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "source_type is required")
		return
	case body.SourceID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "source_id is required")
		return
	case body.AmountMinor <= 0:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT", "amount_minor must be a positive integer")
		return
	case body.Currency == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "currency is required")
		return
	case !currencyRe.MatchString(body.Currency):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_CURRENCY", "currency must be a 3-letter ISO-4217 code")
		return
	case body.IdempotencyKey == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "idempotency_key is required")
		return
	}

	coreType, valid := coreSourceType(body.SourceType)
	if !valid {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_SOURCE_TYPE",
			"source_type must be ACQUIRING_PAYMENT or WALLET_PAYMENT")
		return
	}

	refund, err := h.svc.Create(r.Context(), service.CreateRefundRequest{
		CoreSourceType: coreType,
		SourceID:       body.SourceID,
		MerchantID:     merchantID,
		AmountMinor:    body.AmountMinor,
		Currency:       body.Currency,
		Reason:         body.Reason,
		IdempotencyKey: body.IdempotencyKey,
	})
	if err != nil {
		// Surface the core's rejection faithfully (ceiling, eligibility, authz,
		// not-found) instead of collapsing everything to a 500.
		var re *service.RefundError
		if errors.As(err, &re) {
			apierror.Respond(w, r, re.Status, re.Code, re.Message)
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "refund could not be processed")
		return
	}

	// Proof-state correction is owned by the Core (ADR-034): it flips the source
	// proof to REVERSED only when cumulative restitution reaches the captured
	// amount. The gateway deliberately does not touch the proof here.
	publicizeRefund(refund)
	respond(w, http.StatusCreated, refund)
}

// GET /v1/refunds/{id}
func (h *RefundHandler) Get(w http.ResponseWriter, r *http.Request) {
	// Tenant scope (F1): the merchant comes ONLY from the verified credential —
	// never from the public request — and is passed to Core, which scopes the read.
	merchantID, ok := h.resolveRefundAuthority(w, r, "refunds:read")
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	refund, err := h.svc.Get(r.Context(), id, merchantID)
	if err != nil {
		if errors.Is(err, service.ErrRefundNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "refund not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch refund")
		return
	}
	publicizeRefund(refund)
	respond(w, http.StatusOK, refund)
}

// GET /v1/refunds?source_id=&limit=
func (h *RefundHandler) List(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.resolveRefundAuthority(w, r, "refunds:read")
	if !ok {
		return
	}

	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "limit must be between 1 and 100")
			return
		}
		limit = parsed
	}

	page, err := h.svc.List(r.Context(),
		r.URL.Query().Get("source_id"),
		merchantID,
		limit,
	)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list refunds")
		return
	}
	if page != nil {
		for _, rf := range page.Data {
			publicizeRefund(rf)
		}
	}
	respond(w, http.StatusOK, page)
}
