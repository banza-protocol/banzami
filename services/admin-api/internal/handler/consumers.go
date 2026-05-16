package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
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

