package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	documents "github.com/banzami/banzami/services/common/documents"
	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// Minimal lookups the merchant receipt handler needs (read-only).
type walletPaymentLookup interface {
	GetByID(ctx context.Context, id string) (*service.WalletPayment, error)
}
type consumerLookup interface {
	Get(ctx context.Context, id string) (*service.ConsumerRecord, error)
}
type merchantLookup interface {
	Get(ctx context.Context, id string) (*service.MerchantRecord, error)
}

type pdfGenerator func(context.Context, documents.ReceiptData) ([]byte, error)

// ReceiptHandler serves the official Merchant payment receipt (PDF), generated
// server-side by the shared Document Engine from REAL wallet_payments data.
type ReceiptHandler struct {
	payments  walletPaymentLookup
	consumers consumerLookup
	merchants merchantLookup
	gen       pdfGenerator
}

func NewReceiptHandler(p walletPaymentLookup, c consumerLookup, m merchantLookup) *ReceiptHandler {
	return &ReceiptHandler{payments: p, consumers: c, merchants: m, gen: documents.GeneratePDF}
}

func reference(id string) string {
	hex := strings.ToUpper(strings.ReplaceAll(id, "-", ""))
	if len(hex) < 8 {
		return "BZM-" + hex
	}
	return "BZM-" + hex[0:4] + "-" + hex[4:8]
}

func consumerName(c *service.ConsumerRecord) string {
	if c == nil {
		return ""
	}
	if c.DisplayName != nil && strings.TrimSpace(*c.DisplayName) != "" {
		return *c.DisplayName
	}
	return "@" + c.Handle
}

// GET /v1/merchant/transactions/{id}/receipt.pdf
func (h *ReceiptHandler) MerchantReceipt(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "merchant authentication required")
		return
	}

	if h.payments == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "RECEIPT_UNAVAILABLE", "receipts are not available")
		return
	}

	id := chi.URLParam(r, "id")
	wp, err := h.payments.GetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrWalletPaymentNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "transaction not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not load transaction")
		return
	}

	// Ownership + environment scoping: the merchant may only read its own
	// payments, within its token environment. 404 (never reveal others).
	if wp.MerchantID != principal.MerchantID || !strings.EqualFold(wp.Environment, principal.Environment) {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "transaction not found")
		return
	}

	payer, _ := h.consumers.Get(r.Context(), wp.ConsumerID)
	merchant, _ := h.merchants.Get(r.Context(), wp.MerchantID)

	data := buildMerchantReceipt(wp, payer, merchant)

	pdf, err := h.gen(r.Context(), data)
	if err != nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "RECEIPT_UNAVAILABLE", "receipt generation is temporarily unavailable")
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", documents.Filename(data.Reference)))
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdf)
}

// buildMerchantReceipt maps a real wallet payment + parties into ReceiptData. Pure.
func buildMerchantReceipt(wp *service.WalletPayment, payer *service.ConsumerRecord, merchant *service.MerchantRecord) documents.ReceiptData {
	ref := reference(wp.ID)
	payerHandle, payerName := "", ""
	if payer != nil {
		payerHandle = payer.Handle
		payerName = consumerName(payer)
	}
	merchantName := ""
	if merchant != nil {
		merchantName = merchant.Name
	}
	return documents.ReceiptData{
		ReceiptID:             wp.ID,
		TransactionID:         wp.ID,
		Reference:             ref,
		Perspective:           documents.PerspectiveMerchant,
		AmountMinor:           wp.AmountMinor,
		Currency:              wp.Currency,
		Status:                wp.Status,
		CreatedAt:             wp.CreatedAt,
		CompletedAt:           wp.CreatedAt,
		IssuedAt:              wp.CreatedAt,
		PayerName:             payerName,
		PayerHandle:           payerHandle,
		MerchantName:          merchantName,
		PaymentMethod:         "Pagamento por QR · @banza",
		Environment:           wp.Environment,
		VerificationReference: "banzami.com/r/" + ref,
	}
}
