package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// WalletPaymentsHandler lists a merchant's received wallet-native payments
// (canonical source: wallet_payments). Read-only.
type WalletPaymentsHandler struct {
	lister service.WalletPaymentLister
}

func NewWalletPaymentsHandler(l service.WalletPaymentLister) *WalletPaymentsHandler {
	return &WalletPaymentsHandler{lister: l}
}

type walletPaymentDTO struct {
	ID               string `json:"id"`
	AmountMinor      int64  `json:"amount_minor"`
	Currency         string `json:"currency"`
	Status           string `json:"status"`
	PayerName        string `json:"payer_name"`
	CreatedAt        string `json:"created_at"`
	ReceiptAvailable bool   `json:"receipt_available"`
}

type walletPaymentListResponse struct {
	Items      []walletPaymentDTO `json:"items"`
	NextCursor string             `json:"next_cursor,omitempty"`
}

// GET /v1/merchant/wallet-payments
func (h *WalletPaymentsHandler) List(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "merchant authentication required")
		return
	}
	if h.lister == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "payments listing is not available")
		return
	}

	q := r.URL.Query()
	f := service.WalletPaymentFilter{Status: q.Get("status"), Cursor: q.Get("cursor")}
	if raw := q.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 100 {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "limit must be between 1 and 100")
			return
		}
		f.Limit = n
	}
	if raw := q.Get("date_from"); raw != "" {
		t, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "date_from must be RFC3339")
			return
		}
		f.DateFrom = t
	}
	if raw := q.Get("date_to"); raw != "" {
		t, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "date_to must be RFC3339")
			return
		}
		f.DateTo = t
	}

	items, next, err := h.lister.ListForMerchant(r.Context(), principal.MerchantID, principal.Environment, f)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list payments")
		return
	}

	out := walletPaymentListResponse{Items: make([]walletPaymentDTO, 0, len(items)), NextCursor: next}
	for _, it := range items {
		out.Items = append(out.Items, walletPaymentDTO{
			ID:               it.ID,
			AmountMinor:      it.AmountMinor,
			Currency:         it.Currency,
			Status:           it.Status,
			PayerName:        it.PayerName,
			CreatedAt:        it.CreatedAt.UTC().Format(time.RFC3339),
			ReceiptAvailable: it.Status == "COMPLETED",
		})
	}
	writeJSON(w, http.StatusOK, out)
}
