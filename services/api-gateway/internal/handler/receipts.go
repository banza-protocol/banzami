package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
	documents "github.com/banzami/banzami/services/common/documents"
)

// Minimal lookup the merchant receipt handler needs for ownership (read-only).
type walletPaymentLookup interface {
	GetByID(ctx context.Context, id string) (*service.WalletPayment, error)
}

// merchantLookup reads a Business (used by the payment-session and
// wallet-account handlers).
type merchantLookup interface {
	Get(ctx context.Context, id string) (*service.MerchantRecord, error)
}

type pdfGenerator func(context.Context, documents.ReceiptData) ([]byte, error)

// walletReceiptIssuer is the operator's one derivation of a receipt
// (service.ReceiptSemantics): it establishes the proof and returns the
// canonical receipt every surface shows.
type walletReceiptIssuer interface {
	WalletPaymentReceipt(ctx context.Context, id string, issue bool) (documents.Receipt, error)
}

// ReceiptHandler serves the official Merchant payment receipt (PDF), rendered
// from the canonical receipt of a REAL wallet payment. It no longer looks the
// parties up itself: the payee printed here is the one the proof and the
// public verifier show, because they all come from ReceiptSemantics.
type ReceiptHandler struct {
	payments walletPaymentLookup
	receipts walletReceiptIssuer
	gen      pdfGenerator
}

func NewReceiptHandler(p walletPaymentLookup, proofs *service.ProofService) *ReceiptHandler {
	// A nil *ProofService in an interface is not nil — normalise, or the required
	// dependency check reads as satisfied on a service that does not exist.
	var receipts walletReceiptIssuer
	if proofs != nil {
		receipts = service.NewReceiptSemantics(proofs.Pool(), proofs)
	}
	return &ReceiptHandler{payments: p, receipts: receipts, gen: documents.GeneratePDF}
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

	// The receipt is not the proof — and it may not be issued without one.
	//
	// This fell back to a reference derived from the payment id whenever proofs
	// were unavailable, which produced a document advertising a verification URL
	// that no proof backed and that therefore answered "does not exist or may have
	// been forged" forever. The payment stays complete either way; the receipt can
	// be requested again once the proof subsystem is healthy.
	if h.receipts == nil {
		slog.ErrorContext(r.Context(), "receipt refused: proof service not configured")
		apierror.Respond(w, r, http.StatusServiceUnavailable, "RECEIPT_UNAVAILABLE",
			"receipt generation is temporarily unavailable")
		return
	}
	rec, rerr := h.receipts.WalletPaymentReceipt(r.Context(), wp.ID, true)
	if rerr != nil || rec.ProofReference == "" {
		slog.ErrorContext(r.Context(), "receipt refused: could not establish public proof",
			"wallet_payment_id", wp.ID, "error", rerr)
		apierror.Respond(w, r, http.StatusServiceUnavailable, "RECEIPT_UNAVAILABLE",
			"receipt generation is temporarily unavailable")
		return
	}

	data := documents.ReceiptDataFromReceipt(rec, documents.PerspectiveMerchant)
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
