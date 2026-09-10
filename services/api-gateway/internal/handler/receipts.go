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
	// ProofEnsurer, not the concrete service, so both outcomes — proof established
	// or not — are reachable in a test. A receipt is issued only in the first case.
	proofs ProofEnsurer
	gen    pdfGenerator
}

// ProofEnsurer establishes the durable public proof a receipt may advertise.
type ProofEnsurer interface {
	Ensure(ctx context.Context, in service.ProofInput) (*service.Proof, error)
}

func NewReceiptHandler(p walletPaymentLookup, c consumerLookup, m merchantLookup, proofs *service.ProofService) *ReceiptHandler {
	// A nil *ProofService in an interface is not nil — normalise, or the required
	// dependency check reads as satisfied on a service that does not exist.
	var ensurer ProofEnsurer
	if proofs != nil {
		ensurer = proofs
	}
	return &ReceiptHandler{payments: p, consumers: c, merchants: m, proofs: ensurer, gen: documents.GeneratePDF}
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

	// The receipt is not the proof — and it may not be issued without one.
	//
	// This fell back to a reference derived from the payment id whenever proofs
	// were unavailable, which produced a document advertising a verification URL
	// that no proof backed and that therefore answered "does not exist or may have
	// been forged" forever. The payment stays complete either way; the receipt can
	// be requested again once the proof subsystem is healthy.
	if h.proofs == nil {
		slog.ErrorContext(r.Context(), "receipt refused: proof service not configured")
		apierror.Respond(w, r, http.StatusServiceUnavailable, "RECEIPT_UNAVAILABLE",
			"receipt generation is temporarily unavailable")
		return
	}
	proof, perr := h.proofs.Ensure(r.Context(), proofInputFromPayment(wp, payer, merchant))
	if perr != nil || proof == nil || proof.ProofReference == "" {
		slog.ErrorContext(r.Context(), "receipt refused: could not establish public proof",
			"wallet_payment_id", wp.ID, "error", perr)
		apierror.Respond(w, r, http.StatusServiceUnavailable, "RECEIPT_UNAVAILABLE",
			"receipt generation is temporarily unavailable")
		return
	}
	ref := proof.ProofReference

	data := buildMerchantReceipt(wp, payer, merchant, ref)

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

// proofInputFromPayment maps a real wallet payment + parties into a proof input.
func proofInputFromPayment(wp *service.WalletPayment, payer *service.ConsumerRecord, merchant *service.MerchantRecord) service.ProofInput {
	in := service.ProofInput{
		TransactionID: wp.ID, Environment: wp.Environment,
		PayerSubjectType: "consumer", PayerSubjectID: wp.ConsumerID,
		PayeeSubjectType: "merchant", PayeeSubjectID: wp.MerchantID,
		AmountMinor: wp.AmountMinor, Currency: wp.Currency,
		// Pass the real transaction status through — Ensure's normalizeProofStatus
		// maps it onto the proof vocabulary (COMPLETED→CONFIRMED, REFUNDED→REVERSED,
		// …). Hardcoding CONFIRMED here is what kept a reversed payment showing a
		// green "verified" proof.
		Status:          wp.Status,
		Method:          "Pagamento por QR · @banza",
		LedgerReference: wp.ID,
		ConfirmedAt:     &wp.CreatedAt,
	}
	if payer != nil {
		in.PayerHandle = payer.Handle
		in.PayerDisplayName = consumerName(payer)
	}
	if merchant != nil {
		in.PayeeDisplayName = merchant.Name
	}
	return in
}

// buildMerchantReceipt maps a real wallet payment + parties into ReceiptData. Pure.
func buildMerchantReceipt(wp *service.WalletPayment, payer *service.ConsumerRecord, merchant *service.MerchantRecord, ref string) documents.ReceiptData {
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
