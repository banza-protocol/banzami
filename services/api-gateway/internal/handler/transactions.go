package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// TransactionHandler handles transaction-related HTTP routes.
type TransactionHandler struct {
	svc service.TransactionService
	// pricing resolves the merchant's operator-assigned policy. The same
	// interface the settlement handler uses, for the same reason: there is one
	// question a fee path may ask, and it is "whose policy".
	pricing PricingProfileResolver
}

func NewTransactionHandler(svc service.TransactionService, pricing PricingProfileResolver) *TransactionHandler {
	return &TransactionHandler{svc: svc, pricing: pricing}
}

type createTransactionBody struct {
	IdempotencyKey  string `json:"idempotency_key"`
	TransactionType string `json:"transaction_type"` // optional; defaults to "payment"
	AmountMinor     int64  `json:"amount_minor"`
	Currency        string `json:"currency"`
	Description     string `json:"description"`
	WalletID        string `json:"wallet_id"` // optional
	// No pricing fields. The comment that used to stand here said these were
	// "reference only — never a price", and that a client cannot send a fee
	// because there is no rate field. Both halves were true and the conclusion
	// was wrong: the client picked the reference, and the reference picks the
	// price. It could even send pricing_profile, naming the operator's policy
	// outright, and "absent => unpriced => zero fee" made omitting everything the
	// cheapest option of all.
	//
	// The operator's policy is resolved from the authenticated merchant's own
	// assignment. A body that still carries these fields is decoded and ignored.
}

// Create handles POST /v1/transactions.
//
// The merchant ID is taken from the authenticated principal — clients never
// supply it directly, preventing impersonation.
func (h *TransactionHandler) Create(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
			"only merchant accounts may create transactions")
		return
	}

	var body createTransactionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY",
			"request body must be valid JSON")
		return
	}

	switch {
	case body.IdempotencyKey == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD",
			"idempotency_key is required")
		return
	case body.AmountMinor <= 0:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT",
			"amount_minor must be a positive integer in minor units (e.g. cêntimos for AOA)")
		return
	case body.Currency == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD",
			"currency is required (e.g. AOA, USD, EUR)")
		return
	}

	// Uppercased, and validated here rather than discovered upstream.
	//
	// This defaulted to the lowercase "payment" and sent it verbatim. Core
	// accepts only SCREAMING_SNAKE_CASE — its own wire contract, and what the
	// transactions table's CHECK constraint enforces — so it answered 400
	// "unknown transaction_type: payment" and the block below turned that into
	// a 500. POST /v1/transactions therefore failed for every caller, always,
	// with an error that named nothing. The deployed Sandbox has 0 rows in
	// `transactions` and 263 in `transfers`, which is what that looks like from
	// the outside.
	//
	// Case is not the caller's problem, so both forms are accepted and
	// normalised; an unknown type is a 400 naming the field, not a 500.
	txType := strings.ToUpper(strings.TrimSpace(body.TransactionType))
	if txType == "" {
		txType = "PAYMENT"
	}
	switch txType {
	case "PAYMENT", "REFUND", "REVERSAL", "PAYOUT":
	default:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD",
			"transaction_type must be one of PAYMENT, REFUND, REVERSAL, PAYOUT")
		return
	}

	// The operator's policy, from the merchant's assignment. Unlike a settlement,
	// a transaction with no policy is NOT refused: a transaction is the record of
	// something that happened, and refusing to record it because pricing is
	// unconfigured would lose the event rather than protect the money. It is
	// created unpriced and the pricing gate catches the owner separately.
	pricingProfile := ""
	if h.pricing != nil {
		code, perr := h.pricing.PricingProfileForMerchant(r.Context(), principal.MerchantID)
		if perr != nil {
			apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not resolve pricing")
			return
		}
		pricingProfile = code
	}

	tx, err := h.svc.Create(r.Context(), service.CreateTransactionRequest{
		IdempotencyKey:  body.IdempotencyKey,
		TransactionType: txType,
		AmountMinor:     body.AmountMinor,
		Currency:        body.Currency,
		Description:     body.Description,
		MerchantID:      principal.MerchantID,
		WalletID:        body.WalletID,
		Environment:     principal.Environment,
		PricingProfile:  pricingProfile,
	})
	if err != nil {
		// An upstream rejection is not an operator fault, and reporting it as
		// one is how the case-mismatch above stayed invisible: core answered a
		// precise 400 and the caller was told "internal error". CoreError
		// already distinguishes the two — nothing was using it here.
		if ce, ok := service.AsCoreError(err); ok && ce.IsClientError() {
			code := ce.Code
			if code == "" {
				code = "REJECTED_UPSTREAM"
			}
			apierror.Respond(w, r, ce.Status, code, ce.Message)
			return
		}
		slog.ErrorContext(r.Context(), "transaction.create.failed",
			"merchant_id", principal.MerchantID, "error", err)
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"transaction could not be created")
		return
	}

	respond(w, http.StatusCreated, tx)
}

// Get handles GET /v1/transactions/{id}.
func (h *TransactionHandler) Get(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
			"only merchant accounts may access transactions")
		return
	}

	id := chi.URLParam(r, "id")
	tx, err := h.svc.Get(r.Context(), principal.MerchantID, id, principal.Environment)
	if err != nil {
		if errors.Is(err, service.ErrTransactionNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND",
				"transaction not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"transaction could not be fetched")
		return
	}

	respond(w, http.StatusOK, tx)
}

// List handles GET /v1/transactions.
//
// Query parameters:
//   - limit  — page size, 1–100, default 20
//   - cursor — opaque pagination token from a previous response's next_cursor
func (h *TransactionHandler) List(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
			"only merchant accounts may access transactions")
		return
	}

	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM",
				"limit must be an integer between 1 and 100")
			return
		}
		limit = parsed
	}

	var since *time.Time
	if raw := r.URL.Query().Get("since"); raw != "" {
		t, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM",
				"since must be an RFC3339 timestamp (e.g. 2026-05-01T00:00:00Z)")
			return
		}
		since = &t
	}

	page, err := h.svc.List(r.Context(), service.ListTransactionsRequest{
		MerchantID:  principal.MerchantID,
		Environment: principal.Environment,
		Cursor:      r.URL.Query().Get("cursor"),
		Limit:       limit,
		Since:       since,
	})
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"transactions could not be listed")
		return
	}

	respond(w, http.StatusOK, page)
}
