package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banza-protocol/banzami/services/admin-api/internal/service"
)

// ConsumerHandler handles admin operations on consumers.
type ConsumerHandler struct {
	core *service.CoreAdminClient
}

func NewConsumerHandler(core *service.CoreAdminClient) *ConsumerHandler {
	return &ConsumerHandler{core: core}
}

// GET /admin/v1/consumers[?handle=...]
func (h *ConsumerHandler) List(w http.ResponseWriter, r *http.Request) {
	handle := r.URL.Query().Get("handle")
	result, err := h.core.ListConsumers(r.Context(), handle)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]any{"code": "INTERNAL_ERROR", "message": err.Error()},
		})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// GET /admin/v1/consumers/{id}
func (h *ConsumerHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.GetConsumer(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": map[string]any{"code": "NOT_FOUND", "message": "consumer not found"},
			})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]any{"code": "INTERNAL_ERROR", "message": err.Error()},
		})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// POST /admin/v1/consumers/{id}/suspend
func (h *ConsumerHandler) Suspend(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body struct {
		Notes string `json:"notes"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Notes == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]any{"code": "MISSING_FIELD", "message": "notes is required"},
		})
		return
	}

	result, err := h.core.SuspendConsumer(r.Context(), id, body.Notes)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": map[string]any{"code": "NOT_FOUND", "message": "consumer not found"},
			})
			return
		}
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error": map[string]any{"code": "UNPROCESSABLE", "message": err.Error()},
		})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// PATCH /admin/v1/consumers/{id}/badge
func (h *ConsumerHandler) SetBadge(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body struct {
		Badge *string `json:"badge"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]any{"code": "INVALID_BODY", "message": "request body must be valid JSON"},
		})
		return
	}

	badge := ""
	if body.Badge != nil {
		badge = *body.Badge
	}

	result, err := h.core.SetConsumerBadge(r.Context(), id, badge)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": map[string]any{"code": "NOT_FOUND", "message": "consumer not found"},
			})
			return
		}
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]any{"code": "BAD_REQUEST", "message": err.Error()},
		})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

