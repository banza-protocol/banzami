package handler

// GET /internal/v1/attention-summary — admin-api only (internal key).
//
// What in BANZADMIN is waiting for an operator, counted for this gateway's own
// environment (service/attention.go). Aggregate counts only.

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type attentionCounter interface {
	Summary(ctx context.Context) (service.AttentionSummary, error)
}

type AttentionHandler struct{ svc attentionCounter }

func NewAttentionHandler(svc attentionCounter) *AttentionHandler { return &AttentionHandler{svc: svc} }

func (h *AttentionHandler) Summary(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"error": map[string]string{"code": "UNAVAILABLE", "message": "attention summary unavailable"},
		})
		return
	}
	sum, err := h.svc.Summary(r.Context())
	if err != nil {
		slog.ErrorContext(r.Context(), "attention.summary.failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]string{"code": "SUMMARY_FAILED", "message": "could not compute the attention summary"},
		})
		return
	}
	writeJSON(w, http.StatusOK, sum)
}
