package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// ProofHandler serves the PUBLIC transaction-proof verification (BANZA ADR-040).
// No auth. Returns only safe fields; never leaks internal ids, balances, wallet
// ids, emails, phones, ledger internals, signatures or KYC/KYB data. Every lookup
// is recorded as a verification event (hashed ip/ua only).
type ProofHandler struct {
	svc  *service.ProofService
	salt string // salts the ip/ua hashes so raw values are never stored
}

func NewProofHandler(svc *service.ProofService, salt string) *ProofHandler {
	return &ProofHandler{svc: svc, salt: salt}
}

func (h *ProofHandler) hash(v string) string {
	if v == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(h.salt + ":" + v))
	return hex.EncodeToString(sum[:])[:32]
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// GET /v1/public/proofs/{proof_reference}
func (h *ProofHandler) Verify(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"exists": false, "status": "UNAVAILABLE", "message": "verificação temporariamente indisponível"})
		return
	}
	ref := strings.TrimSpace(chi.URLParam(r, "ref"))
	proof, err := h.svc.GetByReference(r.Context(), ref)
	if err != nil {
		if errors.Is(err, service.ErrProofNotFound) {
			// Friendly 404 — the anti-fraud message is the point.
			writeJSON(w, http.StatusNotFound, map[string]any{
				"exists":  false,
				"status":  "NOT_FOUND",
				"message": "Este comprovativo não existe ou pode ter sido falsificado.",
			})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"exists": false, "status": "ERROR", "message": "não foi possível verificar"})
		return
	}
	// Record the verification (hashed ip/ua only) and bump the counter.
	h.svc.RecordVerification(r.Context(), proof.ID, h.hash(clientIP(r)), h.hash(r.UserAgent()), "")

	// Flow log — public proof status, no PII (correlation_id added by obs).
	slog.InfoContext(r.Context(), "proof.verify", "reference", ref, "status", proof.Status)

	w.Header().Set("Cache-Control", "public, max-age=15")
	resp := h.svc.Public(proof)
	resp["verification_count"] = proof.VerificationCount + 1 // include this hit
	writeJSON(w, http.StatusOK, resp)
}

// POST /internal/v1/proofs/ensure — INTERNAL (admin-api / public-api only, behind
// InternalAuth). Idempotently ensures the verifiable transaction proof and returns
// its public reference. The gateway owns proof generation (it holds the signing
// key + hash salt), so other services ask it to mint the reference rather than
// duplicating the logic — e.g. public-api when it serves a consumer receipt so the
// printed QR resolves at banzami.com/r/<ref> (ADR-040).
func (h *ProofHandler) EnsureProof(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "proofs unavailable"})
		return
	}
	var in struct {
		TransactionID    string     `json:"transaction_id"`
		TransferID       string     `json:"transfer_id"`
		PaymentIntentID  string     `json:"payment_intent_id"`
		Environment      string     `json:"environment"`
		PayerSubjectType string     `json:"payer_subject_type"`
		PayerSubjectID   string     `json:"payer_subject_id"`
		PayerDisplayName string     `json:"payer_display_name"`
		PayerHandle      string     `json:"payer_handle"`
		PayeeSubjectType string     `json:"payee_subject_type"`
		PayeeSubjectID   string     `json:"payee_subject_id"`
		PayeeDisplayName string     `json:"payee_display_name"`
		PayeeHandle      string     `json:"payee_handle"`
		AmountMinor      int64      `json:"amount_minor"`
		Currency         string     `json:"currency"`
		Status           string     `json:"status"`
		Description      string     `json:"description"`
		Method           string     `json:"method"`
		LedgerReference  string     `json:"ledger_reference"`
		ConfirmedAt      *time.Time `json:"confirmed_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.TransactionID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "transaction_id is required"})
		return
	}
	proof, err := h.svc.Ensure(r.Context(), service.ProofInput{
		TransactionID: in.TransactionID, TransferID: in.TransferID, PaymentIntentID: in.PaymentIntentID,
		Environment:      in.Environment,
		PayerSubjectType: in.PayerSubjectType, PayerSubjectID: in.PayerSubjectID, PayerDisplayName: in.PayerDisplayName, PayerHandle: in.PayerHandle,
		PayeeSubjectType: in.PayeeSubjectType, PayeeSubjectID: in.PayeeSubjectID, PayeeDisplayName: in.PayeeDisplayName, PayeeHandle: in.PayeeHandle,
		AmountMinor: in.AmountMinor, Currency: in.Currency, Status: in.Status, Description: in.Description,
		Method: in.Method, LedgerReference: in.LedgerReference, ConfirmedAt: in.ConfirmedAt,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "could not ensure proof"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"proof_reference": proof.ProofReference})
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
	if err := h.svc.MarkReversed(r.Context(), in.TransactionID, in.Environment); err != nil {
		slog.ErrorContext(r.Context(), "proof.mark_reversed.failed", "transaction_id", in.TransactionID, "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "could not reverse proof"})
		return
	}
	slog.InfoContext(r.Context(), "proof.reversed", "transaction_id", in.TransactionID, "cause", "internal")
	writeJSON(w, http.StatusOK, map[string]any{"reversed": true})
}
