package handler

import (
	"encoding/json"
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

// POST /admin/v1/consumers/{id}/test-credit
// Body: { "amount_minor": 50000000, "currency": "AOA" }
func (h *ConsumerHandler) TestCredit(w http.ResponseWriter, r *http.Request) {
	consumerID := chi.URLParam(r, "id")

	var body struct {
		AmountMinor int64  `json:"amount_minor"`
		Currency    string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AmountMinor <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]any{"code": "INVALID_BODY", "message": "amount_minor must be a positive integer"},
		})
		return
	}
	if body.Currency == "" {
		body.Currency = "AOA"
	}

	result, err := h.core.TestCreditConsumer(r.Context(), consumerID, body.AmountMinor, body.Currency)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": map[string]any{"code": "WALLET_NOT_FOUND", "message": "no active wallet for consumer"},
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
