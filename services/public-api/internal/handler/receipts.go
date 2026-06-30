package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	documents "github.com/banzami/banzami/services/common/documents"
	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// ReceiptCore is the subset of the core client the receipt handler needs.
type ReceiptCore interface {
	GetTransfer(ctx context.Context, id string) (*service.Transfer, error)
	GetConsumer(ctx context.Context, id string) (*service.ConsumerRecord, error)
}

// pdfGenerator renders ReceiptData to a PDF; swappable in tests.
type pdfGenerator func(context.Context, documents.ReceiptData) ([]byte, error)

// ReceiptHandler serves the official Consumer transfer receipt (PDF) generated
// server-side by the shared Document Engine from real `transfers` data.
type ReceiptHandler struct {
	core   ReceiptCore
	gen    pdfGenerator
	proofs *service.ProofClient // optional; mints the verifiable proof reference
	env    string               // "LIVE" | "SANDBOX" (gateway proof vocabulary)
}

func NewReceiptHandler(core ReceiptCore, proofs *service.ProofClient, environment string) *ReceiptHandler {
	env := "LIVE"
	if strings.EqualFold(strings.TrimSpace(environment), "SANDBOX") {
		env = "SANDBOX"
	}
	return &ReceiptHandler{core: core, gen: documents.GeneratePDF, proofs: proofs, env: env}
}

func nameOf(c *service.ConsumerRecord) string {
	if c == nil {
		return ""
	}
	if c.DisplayName != nil && strings.TrimSpace(*c.DisplayName) != "" {
		return *c.DisplayName
	}
	return "@" + c.Handle
}

func handleOf(c *service.ConsumerRecord) string {
	if c == nil {
		return ""
	}
	return c.Handle
}

// reference derives a human, verifiable reference from a transfer UUID:
// BZM-XXXX-XXXX (first 8 hex chars, uppercased).
func reference(id string) string {
	hex := strings.ToUpper(strings.ReplaceAll(id, "-", ""))
	if len(hex) < 8 {
		return "BZM-" + hex
	}
	return "BZM-" + hex[0:4] + "-" + hex[4:8]
}

// GET /v1/consumer/transactions/{id}/receipt.pdf
func (h *ReceiptHandler) ConsumerReceipt(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	t, err := h.core.GetTransfer(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrTransferNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "transaction not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not load transaction")
		return
	}

	// Ownership: the consumer must be a party to the transfer. 404 (not 403) so we
	// never reveal the existence of someone else's transaction.
	if t.SenderID != consumer.ID && t.RecipientID != consumer.ID {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "transaction not found")
		return
	}

	sender, _ := h.core.GetConsumer(r.Context(), t.SenderID)
	recipient, _ := h.core.GetConsumer(r.Context(), t.RecipientID)

	// Mint (idempotently) the verifiable transaction proof so the receipt QR
	// resolves to a GREEN verification page at banzami.com/r/<ref>. Fall back to
	// the derived reference if the gateway is unreachable — the QR still renders
	// (it just won't resolve until a proof exists), never blocking the receipt.
	ref := reference(t.ID)
	if h.proofs != nil {
		if pref, perr := h.proofs.EnsureReference(r.Context(), proofInputFromTransfer(t, sender, recipient, h.env)); perr == nil && pref != "" {
			ref = pref
		}
	}

	data := buildConsumerReceipt(t, sender, recipient, ref)

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

// proofInputFromTransfer builds the gateway ensure-proof payload from a canonical
// transfer. Both parties are consumers (P2P).
func proofInputFromTransfer(t *service.Transfer, sender, recipient *service.ConsumerRecord, env string) service.ProofEnsureInput {
	desc := ""
	if t.Description != nil {
		desc = *t.Description
	}
	confirmed := t.UpdatedAt
	return service.ProofEnsureInput{
		TransactionID:    t.ID,
		TransferID:       t.ID,
		Environment:      env,
		PayerSubjectType: "consumer",
		PayerSubjectID:   t.SenderID,
		PayerDisplayName: nameOf(sender),
		PayerHandle:      handleOf(sender),
		PayeeSubjectType: "consumer",
		PayeeSubjectID:   t.RecipientID,
		PayeeDisplayName: nameOf(recipient),
		PayeeHandle:      handleOf(recipient),
		AmountMinor:      t.Amount.AmountMinor,
		Currency:         t.Currency,
		Status:           t.Status,
		Description:      desc,
		Method:           "Transferência Banzami · @banza",
		LedgerReference:  t.ID,
		ConfirmedAt:      &confirmed,
	}
}

// buildConsumerReceipt maps a real transfer + parties into ReceiptData. Pure.
func buildConsumerReceipt(t *service.Transfer, sender, recipient *service.ConsumerRecord, ref string) documents.ReceiptData {
	desc := ""
	if t.Description != nil {
		desc = *t.Description
	}
	return documents.ReceiptData{
		ReceiptID:             t.ID,
		TransactionID:         t.ID,
		Reference:             ref,
		Perspective:           documents.PerspectiveConsumer,
		AmountMinor:           t.Amount.AmountMinor,
		Currency:              t.Currency,
		Status:                t.Status,
		CreatedAt:             t.CreatedAt,
		CompletedAt:           t.UpdatedAt,
		IssuedAt:              t.UpdatedAt,
		PayerName:             nameOf(sender),
		PayerHandle:           handleOf(sender),
		RecipientName:         nameOf(recipient),
		RecipientHandle:       handleOf(recipient),
		PaymentMethod:         "Transferência Banzami · @banza",
		Description:           desc,
		VerificationReference: "banzami.com/r/" + ref,
	}
}
