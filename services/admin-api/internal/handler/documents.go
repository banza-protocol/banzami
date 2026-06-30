package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
	documents "github.com/banzami/banzami/services/common/documents"
)

// ReceiptSource loads official ReceiptData for a transaction (read-only).
type ReceiptSource interface {
	LoadReceipt(ctx context.Context, id string) (documents.ReceiptData, error)
}

type pdfGenerator func(context.Context, documents.ReceiptData) ([]byte, error)

// DocumentHandler serves official transaction receipts (PDF) to BANZADMIN via
// the shared Document Engine, from the same real sources (wallet_payments,
// transfers). Read-only.
type DocumentHandler struct {
	src ReceiptSource
	gen pdfGenerator
}

func NewDocumentHandler(src ReceiptSource) *DocumentHandler {
	return &DocumentHandler{src: src, gen: documents.GeneratePDF}
}

// GET /admin/v1/transactions/{id}/receipt.pdf  (capability-gated + audited)
func (h *DocumentHandler) TransactionReceipt(w http.ResponseWriter, r *http.Request) {
	if h.src == nil {
		writeError(w, http.StatusServiceUnavailable, "RECEIPT_UNAVAILABLE", "receipts are not available")
		return
	}
	id := chi.URLParam(r, "id")
	data, err := h.src.LoadReceipt(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrReceiptNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "transaction not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not load transaction")
		return
	}

	pdf, err := h.gen(r.Context(), data)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "RECEIPT_UNAVAILABLE", "receipt generation is temporarily unavailable")
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", documents.Filename(data.Reference)))
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdf)
}
