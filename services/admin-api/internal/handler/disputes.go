package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type DisputeHandler struct {
	core *service.CoreAdminClient
}

func NewDisputeHandler(core *service.CoreAdminClient) *DisputeHandler {
	return &DisputeHandler{core: core}
}

// GET /admin/v1/disputes?merchant_id=&consumer_id=&status=&limit=
func (h *DisputeHandler) List(w http.ResponseWriter, r *http.Request) {
	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			writeError(w, http.StatusBadRequest, "INVALID_PARAM", "limit must be between 1 and 100")
			return
		}
		limit = parsed
	}

	result, err := h.core.ListDisputes(r.Context(),
		r.URL.Query().Get("merchant_id"),
		r.URL.Query().Get("consumer_id"),
		r.URL.Query().Get("status"),
		limit,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// GET /admin/v1/disputes/{id}
func (h *DisputeHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.GetDispute(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "dispute not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// POST /admin/v1/disputes/{id}/resolve
func (h *DisputeHandler) Resolve(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body struct {
		Outcome         string `json:"outcome"`
		ResolutionNotes string `json:"resolution_notes"`
		ResolvedBy      string `json:"resolved_by"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	switch {
	case body.Outcome == "":
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "outcome is required")
		return
	case body.ResolvedBy == "":
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "resolved_by is required")
		return
	}

	result, err := h.core.ResolveDispute(r.Context(), id, body.Outcome, body.ResolutionNotes, body.ResolvedBy)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "dispute not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}
