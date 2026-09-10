package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type WalletHandler struct {
	svc service.WalletService
}

func NewWalletHandler(svc service.WalletService) *WalletHandler {
	return &WalletHandler{svc: svc}
}

// POST /v1/wallets
// Provisions a new wallet for the authenticated merchant.
// Body: {"currency": "AOA"}
func (h *WalletHandler) Create(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant authentication required")
		return
	}

	var body struct {
		Currency string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Currency == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "currency is required")
		return
	}

	wallet, err := h.svc.Create(r.Context(), principal.MerchantID, body.Currency)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrDuplicateWallet):
			apierror.Respond(w, r, http.StatusConflict, "DUPLICATE_WALLET",
				"a wallet for this currency already exists")
		case errors.Is(err, service.ErrUnsupportedCurrency):
			apierror.Respond(w, r, http.StatusBadRequest, "UNSUPPORTED_CURRENCY",
				"currency is not supported")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
				"failed to create wallet")
		}
		return
	}

	writeJSON(w, http.StatusCreated, wallet)
}

// GET /v1/wallets?currency=AOA
// Returns the wallet for the authenticated merchant and the given currency.
func (h *WalletHandler) GetForMerchant(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant authentication required")
		return
	}
	currency := r.URL.Query().Get("currency")
	if currency == "" {
		currency = "AOA"
	}
	wallet, err := h.svc.GetForMerchant(r.Context(), principal.MerchantID, currency)
	if err != nil {
		if errors.Is(err, service.ErrWalletNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet not found for this currency")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to retrieve wallet")
		return
	}
	writeJSON(w, http.StatusOK, wallet)
}

// requireOwnedWallet resolves the wallet named in the {id} path segment and
// enforces that the authenticated merchant OWNS it (SEC-002).
//
// Authentication is not authorisation: every route below lives inside the
// merchant-JWT group, so the caller is *some* authenticated merchant — that
// alone must never grant access to another merchant's wallet. Possession of a
// wallet id confers no authority.
//
// A wallet belonging to a different merchant is reported as NOT_FOUND rather
// than FORBIDDEN so the endpoint cannot be used as an existence oracle to
// enumerate wallet ids across tenants; the caller learns nothing it did not
// already know. Returns (wallet, true) only when the caller may proceed; when
// it returns false the response has already been written.
func (h *WalletHandler) requireOwnedWallet(w http.ResponseWriter, r *http.Request) (*service.WalletRecord, bool) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant authentication required")
		return nil, false
	}
	wallet, err := h.svc.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrWalletNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet not found")
			return nil, false
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to retrieve wallet")
		return nil, false
	}
	if wallet == nil || wallet.MerchantID != principal.MerchantID {
		if wallet != nil {
			businessTenantDenials.WithLabelValues(tenantSurfaceWallet).Inc()
		}
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet not found")
		return nil, false
	}
	return wallet, true
}

// GET /v1/wallets/{id}
func (h *WalletHandler) Get(w http.ResponseWriter, r *http.Request) {
	wallet, ok := h.requireOwnedWallet(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, wallet)
}

// GET /v1/wallets/{id}/balance
func (h *WalletHandler) Balance(w http.ResponseWriter, r *http.Request) {
	wallet, ok := h.requireOwnedWallet(w, r)
	if !ok {
		return
	}
	id := wallet.ID

	balance, err := h.svc.Balance(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrWalletNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"failed to retrieve balance")
		return
	}

	writeJSON(w, http.StatusOK, balance)
}

// Analytics returns merchant payment-volume analytics for a wallet, aggregated
// from the ledger. Optional ?from= and ?to= are RFC3339 timestamps.
func (h *WalletHandler) Analytics(w http.ResponseWriter, r *http.Request) {
	wallet, ok := h.requireOwnedWallet(w, r)
	if !ok {
		return
	}
	id := wallet.ID
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")

	data, err := h.svc.Analytics(r.Context(), id, from, to)
	if err != nil {
		if errors.Is(err, service.ErrWalletNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"failed to retrieve analytics")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
