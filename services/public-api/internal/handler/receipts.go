package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	documents "github.com/banzami/banzami/services/common/documents"
	banzamienv "github.com/banzami/banzami/services/common/env"
	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// ReceiptCore is the subset of the core client the receipt handler needs: the
// transfer, to check that the caller is a party to it.
type ReceiptCore interface {
	GetTransfer(ctx context.Context, id string) (*service.Transfer, error)
}

// pdfGenerator renders ReceiptData to a PDF; swappable in tests.
type pdfGenerator func(context.Context, documents.ReceiptData) ([]byte, error)

// ReceiptIssuer establishes a transfer's proof and returns its canonical
// receipt. The operator derives the parties and the operation from the
// ledger's records (api-gateway service/receipt_semantics.go); this service
// never assembles them. Narrow on purpose: both outcomes that matter — a
// receipt was established, or it was not — are reachable in a test, and a
// receipt is only issued in the first.
type ReceiptIssuer interface {
	TransferReceipt(ctx context.Context, transactionID, environment string, issue bool) (documents.Receipt, error)
}

// ReceiptHandler serves a consumer's receipt of a transfer — the official PDF
// (Document Engine) and the same receipt as JSON for the app's comprovativo
// screen. Both are the one canonical receipt: the phone, the PDF and the
// public verifier say the same thing because none of them derives it.
type ReceiptHandler struct {
	core     ReceiptCore
	gen      pdfGenerator
	receipts ReceiptIssuer
	env      string // "LIVE" | "SANDBOX"
}

func NewReceiptHandler(core ReceiptCore, receipts ReceiptIssuer, environment string) *ReceiptHandler {
	// A nil *ProofClient stored in an interface is NOT nil. NewProofClient returns
	// nil when the internal proof authority is unconfigured, and without this
	// normalisation the dependency check would silently pass on a nil client.
	if pc, ok := receipts.(*service.ProofClient); ok && pc == nil {
		receipts = nil
	}
	// The receipt names the environment this stack serves, parsed — not "LIVE
	// unless it says SANDBOX". An unknown one issues no receipt at all.
	parsed := banzamienv.Parse(environment)
	if !parsed.IsKnown() {
		receipts = nil
	}
	return &ReceiptHandler{core: core, gen: documents.GeneratePDF, receipts: receipts, env: parsed.String()}
}

// receipt resolves the caller's receipt for transfer {id}, writing the error
// response itself when there is none.
func (h *ReceiptHandler) receipt(w http.ResponseWriter, r *http.Request) (documents.Receipt, bool) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return documents.Receipt{}, false
	}
	id := chi.URLParam(r, "id")
	t, err := h.core.GetTransfer(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrTransferNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "transaction not found")
			return documents.Receipt{}, false
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not load transaction")
		return documents.Receipt{}, false
	}
	// Ownership: the consumer must be a party to the transfer. 404 (not 403) so we
	// never reveal the existence of someone else's transaction.
	if t.SenderID != consumer.ID && t.RecipientID != consumer.ID {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "transaction not found")
		return documents.Receipt{}, false
	}

	// The proof comes FIRST, and a receipt is only issued if it exists. There is
	// no fallback reference: a receipt that advertises a verification that never
	// resolves is worse than no receipt — the transfer is complete, and the user
	// can ask again in a moment.
	if h.receipts == nil {
		slog.ErrorContext(r.Context(), "receipt refused: receipt issuer not configured")
		apierror.Respond(w, r, http.StatusServiceUnavailable, "RECEIPT_UNAVAILABLE",
			"receipt generation is temporarily unavailable")
		return documents.Receipt{}, false
	}
	rec, err := h.receipts.TransferReceipt(r.Context(), t.ID, h.env, true)
	if err != nil || rec.ProofReference == "" {
		slog.ErrorContext(r.Context(), "receipt refused: could not establish public proof",
			"transfer_id", t.ID, "error", err)
		apierror.Respond(w, r, http.StatusServiceUnavailable, "RECEIPT_UNAVAILABLE",
			"receipt generation is temporarily unavailable")
		return documents.Receipt{}, false
	}
	return rec, true
}

// GET /v1/consumer/transactions/{id}/receipt.pdf
func (h *ReceiptHandler) ConsumerReceipt(w http.ResponseWriter, r *http.Request) {
	rec, ok := h.receipt(w, r)
	if !ok {
		return
	}
	data := documents.ReceiptDataFromReceipt(rec, documents.PerspectiveConsumer)
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

// GET /v1/consumer/transactions/{id}/receipt — the same receipt as JSON, for
// the app's comprovativo screen, share sheet and "Copiar detalhes".
func (h *ReceiptHandler) ConsumerReceiptJSON(w http.ResponseWriter, r *http.Request) {
	rec, ok := h.receipt(w, r)
	if !ok {
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	respond(w, http.StatusOK, rec)
}
