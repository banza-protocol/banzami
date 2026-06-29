package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// ProofsHandler is the READ-ONLY operator view of transaction proofs (ADR-040).
// Never edits or deletes a proof. LIVE uses the primary DB; SANDBOX the staging DB.
type ProofsHandler struct {
	live    *service.ProofAdminService
	sandbox *service.ProofAdminService
}

func NewProofsHandler(live, sandbox *service.ProofAdminService) *ProofsHandler {
	return &ProofsHandler{live: live, sandbox: sandbox}
}

func (h *ProofsHandler) pick(r *http.Request) (*service.ProofAdminService, bool) {
	if r.URL.Query().Get("environment") == "SANDBOX" {
		return h.sandbox, h.sandbox != nil
	}
	return h.live, h.live != nil
}

// GET /admin/v1/proofs?q=&environment=
func (h *ProofsHandler) List(w http.ResponseWriter, r *http.Request) {
	svc, ok := h.pick(r)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "proofs are not available for this environment")
		return
	}
	proofs, err := svc.List(r.Context(), r.URL.Query().Get("q"), 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list proofs")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"proofs": proofs})
}

// GET /admin/v1/proofs/{ref}?environment=
func (h *ProofsHandler) Get(w http.ResponseWriter, r *http.Request) {
	svc, ok := h.pick(r)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "proofs are not available for this environment")
		return
	}
	proof, events, err := svc.Get(r.Context(), chi.URLParam(r, "ref"))
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "proof not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not load proof")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"proof": proof, "verifications": events})
}
