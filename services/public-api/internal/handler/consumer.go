package handler

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// ConsumerHandler exposes public consumer lookups.
type ConsumerHandler struct {
	creds *service.CredentialStore
}

func NewConsumerHandler(creds *service.CredentialStore) *ConsumerHandler {
	return &ConsumerHandler{creds: creds}
}

// GET /v1/consumers/{handle}
// Returns 200 if the handle is registered, 404 otherwise.
// Used by the mobile app to validate handles before the PIN step.
func (h *ConsumerHandler) Lookup(w http.ResponseWriter, r *http.Request) {
	handle := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "handle")))
	if handle == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "handle is required")
		return
	}

	exists, err := h.creds.Exists(r.Context(), handle)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "lookup failed")
		return
	}

	if !exists {
		apierror.Respond(w, r, http.StatusNotFound, "CONSUMER_NOT_FOUND", "handle not registered")
		return
	}

	respond(w, http.StatusOK, map[string]any{"handle": handle})
}
