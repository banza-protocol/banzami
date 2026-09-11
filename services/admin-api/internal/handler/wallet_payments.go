package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// AdminWalletPaymentLister lists wallet payments (admin scope, read-only).
type AdminWalletPaymentLister interface {
	List(ctx context.Context, f service.AdminWalletPaymentFilter) ([]service.AdminWalletPaymentItem, string, error)
}

// WalletPaymentsHandler serves the admin received-payments list (wallet_payments).
type WalletPaymentsHandler struct {
	lister AdminWalletPaymentLister
}

func NewWalletPaymentsHandler(l AdminWalletPaymentLister) *WalletPaymentsHandler {
	return &WalletPaymentsHandler{lister: l}
}

// adminWalletPaymentDTO: payee_handle / payee_display_name are the Business's
// public identity (what receipts show); merchant_name is the raw account name.
// proof_reference is the operation's existing proof (the transfer's) or empty —
// never a value derived from an id (see service.AdminWalletPaymentItem).
type adminWalletPaymentDTO struct {
	ID               string `json:"id"`
	MerchantID       string `json:"merchant_id"`
	MerchantName     string `json:"merchant_name"`
	PayeeHandle      string `json:"payee_handle"`
	PayeeDisplayName string `json:"payee_display_name"`
	PayerName        string `json:"payer_name"`
	AmountMinor      int64  `json:"amount_minor"`
	Currency         string `json:"currency"`
	Status           string `json:"status"`
	Environment      string `json:"environment"`
	CreatedAt        string `json:"created_at"`
	ReceiptAvailable bool   `json:"receipt_available"`
	ProofReference   string `json:"proof_reference"`
}

type adminWalletPaymentListResponse struct {
	Items      []adminWalletPaymentDTO `json:"items"`
	NextCursor string                  `json:"next_cursor,omitempty"`
}

// GET /admin/v1/wallet-payments  (capability-gated + audited)
func (h *WalletPaymentsHandler) List(w http.ResponseWriter, r *http.Request) {
	if h.lister == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "payments listing is not available")
		return
	}
	q := r.URL.Query()
	f := service.AdminWalletPaymentFilter{
		MerchantID:  q.Get("merchant_id"),
		Status:      q.Get("status"),
		Environment: q.Get("environment"),
		Cursor:      q.Get("cursor"),
	}
	if raw := q.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 100 {
			writeError(w, http.StatusBadRequest, "INVALID_PARAM", "limit must be between 1 and 100")
			return
		}
		f.Limit = n
	}
	for _, p := range []struct {
		key string
		dst *time.Time
	}{{"date_from", &f.DateFrom}, {"date_to", &f.DateTo}} {
		if raw := q.Get(p.key); raw != "" {
			t, err := time.Parse(time.RFC3339, raw)
			if err != nil {
				writeError(w, http.StatusBadRequest, "INVALID_PARAM", p.key+" must be RFC3339")
				return
			}
			*p.dst = t
		}
	}

	items, next, err := h.lister.List(r.Context(), f)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list payments")
		return
	}

	out := adminWalletPaymentListResponse{Items: make([]adminWalletPaymentDTO, 0, len(items)), NextCursor: next}
	for _, it := range items {
		out.Items = append(out.Items, adminWalletPaymentDTO{
			ID:               it.ID,
			MerchantID:       it.MerchantID,
			MerchantName:     it.MerchantName,
			PayeeHandle:      it.PayeeHandle,
			PayeeDisplayName: it.PayeeDisplayName,
			PayerName:        it.PayerName,
			AmountMinor:      it.AmountMinor,
			Currency:         it.Currency,
			Status:           it.Status,
			Environment:      it.Environment,
			CreatedAt:        it.CreatedAt.UTC().Format(time.RFC3339),
			ReceiptAvailable: it.Status == "COMPLETED",
			ProofReference:   it.ProofReference,
		})
	}
	writeJSON(w, http.StatusOK, out)
}
