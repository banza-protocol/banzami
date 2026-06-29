package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"strings"

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

	w.Header().Set("Cache-Control", "public, max-age=15")
	resp := h.svc.Public(proof)
	resp["verification_count"] = proof.VerificationCount + 1 // include this hit
	writeJSON(w, http.StatusOK, resp)
}
