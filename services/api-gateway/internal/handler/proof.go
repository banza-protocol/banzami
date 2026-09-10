package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
	documents "github.com/banzami/banzami/services/common/documents"
)

// ProofHandler serves the PUBLIC transaction-proof verification (BANZA ADR-023).
// No auth. Returns only safe fields; never leaks internal ids, balances, wallet
// ids, emails, phones, ledger internals, signatures or KYC/KYB data. Every lookup
// is recorded as a verification event (hashed ip/ua only).
type ProofHandler struct {
	svc       *service.ProofService
	semantics receiptIssuer
	salt      string // salts the ip/ua hashes so raw values are never stored
}

// receiptIssuer is the operator's one derivation of a receipt
// (service.ReceiptSemantics).
type receiptIssuer interface {
	TransferReceipt(ctx context.Context, transferID, environment string, issue bool) (documents.Receipt, error)
	WalletPaymentReceipt(ctx context.Context, id string, issue bool) (documents.Receipt, error)
}

func NewProofHandler(svc *service.ProofService, salt string) *ProofHandler {
	h := &ProofHandler{svc: svc, salt: salt}
	if svc != nil {
		h.semantics = service.NewReceiptSemantics(svc.Pool(), svc)
	}
	return h
}

func (h *ProofHandler) hash(v string) string {
	if v == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(h.salt + ":" + v))
	return hex.EncodeToString(sum[:])[:32]
}

// clientIP is the address chi's RealIP resolved from the edge's headers — the
// same one the rate limiter uses — not the caller's own X-Forwarded-For.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// GET /v1/public/proofs/{proof_reference}
func (h *ProofHandler) Verify(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		middleware.RecordProofVerify(middleware.RefClassInvalid, middleware.ProofResultUnavailable)
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"exists": false, "status": "UNAVAILABLE", "message": "verificação temporariamente indisponível"})
		return
	}
	ref := strings.TrimSpace(chi.URLParam(r, "ref"))
	refClass := middleware.RefClassInvalid
	switch service.ClassifyReference(ref) {
	case service.ReferenceLegacyV0:
		refClass = middleware.RefClassLegacyV0
	case service.ReferenceSecureV1:
		refClass = middleware.RefClassSecureV1
	}
	proof, err := h.svc.GetByReference(r.Context(), ref)
	if err != nil {
		if errors.Is(err, service.ErrProofNotFound) {
			// Friendly 404 — the anti-fraud message is the point.
			middleware.RecordProofVerify(refClass, middleware.ProofResultNotFound)
			writeJSON(w, http.StatusNotFound, map[string]any{
				"exists":  false,
				"status":  "NOT_FOUND",
				"message": "Este comprovativo não existe ou pode ter sido falsificado.",
			})
			return
		}
		middleware.RecordProofVerify(refClass, middleware.ProofResultError)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"exists": false, "status": "ERROR", "message": "não foi possível verificar"})
		return
	}
	// Record the verification (hashed ip/ua only) and bump the counter.
	h.svc.RecordVerification(r.Context(), proof.ID, h.hash(clientIP(r)), h.hash(r.UserAgent()), "")

	// Flow log — class and outcome only.
	//
	// This logged the full reference. A public proof reference is a BEARER
	// capability: anyone holding it learns the amount, both @handles and the
	// description, so writing it to every log sink turns the log into a
	// distribution channel for the thing it is describing. The class is enough to
	// understand traffic, and the proof id is already the durable audit link.
	slog.InfoContext(r.Context(), "proof.verify",
		"reference_class", refClass, "proof_id", proof.ID, "status", proof.Status)
	middleware.RecordProofVerify(refClass, middleware.ProofResultVerified)

	w.Header().Set("Cache-Control", "public, max-age=15")
	// The verification is still recorded above (operator analytics), but the
	// counter is never exposed publicly (ADR-033 §5).
	writeJSON(w, http.StatusOK, h.svc.Public(proof))
}

// POST /internal/v1/proofs/ensure — INTERNAL (public-api, behind InternalAuth).
// Idempotently establishes the proof of a TRANSFER and returns its public
// reference.
//
// The body used to carry the whole proof — both parties' names and handles,
// the description, the method — and the gateway minted whatever it was given.
// That is how a payment-link payment to @doa was proven with an empty payee: the
// caller assumed a consumer recipient. Only the transaction id and environment
// are read now; everything else is derived here, from the ledger's records
// (service.ReceiptSemantics). Kept for callers that only need the reference;
// /internal/v1/receipts/transfer returns the whole receipt.
func (h *ProofHandler) EnsureProof(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil || h.semantics == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "proofs unavailable"})
		return
	}
	var in struct {
		TransactionID string `json:"transaction_id"`
		Environment   string `json:"environment"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.TransactionID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "transaction_id is required"})
		return
	}
	rec, ok := h.issue(w, r, in.TransactionID, in.Environment, true)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"proof_reference": rec.ProofReference})
}

// POST /internal/v1/receipts/transfer — INTERNAL (public-api, admin-api).
// {transaction_id, environment, issue}. Returns the canonical receipt of a
// transfer: who paid whom, what the operation was, its proof reference. issue
// establishes the proof (a party asking for its receipt); without it nothing
// is written (an operator reading one).
func (h *ProofHandler) TransferReceipt(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil || h.semantics == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "receipts unavailable"})
		return
	}
	var in struct {
		TransactionID string `json:"transaction_id"`
		Environment   string `json:"environment"`
		Issue         bool   `json:"issue"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.TransactionID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "transaction_id is required"})
		return
	}
	rec, ok := h.issue(w, r, in.TransactionID, in.Environment, in.Issue)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"receipt": rec})
}

// POST /internal/v1/receipts/wallet-payment — INTERNAL (admin-api). {id, issue}.
// The canonical receipt of a wallet payment; issue=false writes nothing.
func (h *ProofHandler) WalletPaymentReceipt(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil || h.semantics == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "receipts unavailable"})
		return
	}
	var in struct {
		ID    string `json:"id"`
		Issue bool   `json:"issue"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.ID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "id is required"})
		return
	}
	rec, err := h.semantics.WalletPaymentReceipt(r.Context(), in.ID, in.Issue)
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, map[string]any{"receipt": rec})
	case errors.Is(err, service.ErrReceiptSourceNotFound):
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "no such wallet payment"})
	default:
		slog.ErrorContext(r.Context(), "receipt.failed", "wallet_payment_id", in.ID, "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "could not establish the receipt"})
	}
}

// GET /internal/v1/businesses/{id}/public-identity — INTERNAL (public-api).
// The Business a payer is about to pay, as every receipt will name it.
func (h *ProofHandler) BusinessIdentity(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "unavailable"})
		return
	}
	b, err := service.LookupBusinessIdentity(r.Context(), h.svc.Pool(), chi.URLParam(r, "id"))
	if errors.Is(err, service.ErrBusinessNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "business not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "could not read the business"})
		return
	}
	writeJSON(w, http.StatusOK, b)
}

func (h *ProofHandler) issue(w http.ResponseWriter, r *http.Request, id, env string, issue bool) (documents.Receipt, bool) {
	rec, err := h.semantics.TransferReceipt(r.Context(), id, env, issue)
	switch {
	case err == nil:
		return rec, true
	case errors.Is(err, service.ErrProofEnvironmentRequired):
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "environment must be SANDBOX or LIVE"})
	case errors.Is(err, service.ErrReceiptSourceNotFound):
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "no such transfer in this environment"})
	case errors.Is(err, service.ErrReceiptUndeterminable):
		slog.ErrorContext(r.Context(), "receipt.undeterminable", "transfer_id", id)
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "the transfer's recipient cannot be determined"})
	default:
		slog.ErrorContext(r.Context(), "receipt.failed", "transfer_id", id, "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "could not establish the receipt"})
	}
	return documents.Receipt{}, false
}

// POST /internal/v1/proofs/reverse — INTERNAL (behind InternalAuth). Proactively
// flips a transaction's proof to REVERSED on a refund / dispute-won-by-consumer /
// reversal, so the public page goes red immediately instead of waiting for a
// receipt re-fetch. Idempotent; a no-op when no proof exists yet (Ensure will then
// materialize it as REVERSED). Audit Part 7 / Unit 3.
func (h *ProofHandler) Reverse(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "proofs unavailable"})
		return
	}
	var in struct {
		TransactionID string `json:"transaction_id"`
		Environment   string `json:"environment"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.TransactionID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "transaction_id is required"})
		return
	}
	err := h.svc.MarkReversed(r.Context(), in.TransactionID, in.Environment)
	if errors.Is(err, service.ErrProofEnvironmentRequired) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "environment must be SANDBOX or LIVE"})
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "proof.mark_reversed.failed", "transaction_id", in.TransactionID, "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "could not reverse proof"})
		return
	}
	slog.InfoContext(r.Context(), "proof.reversed", "transaction_id", in.TransactionID, "cause", "internal")
	writeJSON(w, http.StatusOK, map[string]any{"reversed": true})
}
