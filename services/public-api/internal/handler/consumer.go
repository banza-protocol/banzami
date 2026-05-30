package handler

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/banza-protocol/banzami/services/public-api/internal/apierror"
	"github.com/banza-protocol/banzami/services/public-api/internal/service"
)

// ConsumerHandler exposes public consumer lookups and handle search.
type ConsumerHandler struct {
	creds *service.CredentialStore
	core  *service.CorePublicClient
}

func NewConsumerHandler(creds *service.CredentialStore, core *service.CorePublicClient) *ConsumerHandler {
	return &ConsumerHandler{creds: creds, core: core}
}

// GET /v1/consumers/search?q=prefix
// Returns up to 5 active handles matching the query (case-insensitive substring).
// No authentication required — only handle and display_name are returned.
func (h *ConsumerHandler) Search(w http.ResponseWriter, r *http.Request) {
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	if len(q) < 2 {
		respond(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}

	suggestions, err := h.core.SearchConsumers(r.Context(), q, 5)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "search failed")
		return
	}

	respond(w, http.StatusOK, map[string]any{"data": suggestions})
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
