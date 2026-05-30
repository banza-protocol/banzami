package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// ConsumerPayLinkHandler serves the public /public/consumer-pay-links/:code endpoint.
// Used by the pay web app to render the /r/:code payment request page.
type ConsumerPayLinkHandler struct {
	svc service.ConsumerPayLinkService
}

func NewConsumerPayLinkHandler(svc service.ConsumerPayLinkService) *ConsumerPayLinkHandler {
	return &ConsumerPayLinkHandler{svc: svc}
}

// GET /public/consumer-pay-links/:code
func (h *ConsumerPayLinkHandler) GetPublic(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if code == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_PARAM", "code is required")
		return
	}

	link, err := h.svc.GetByCode(r.Context(), code)
	if err != nil {
		if errors.Is(err, service.ErrConsumerPayLinkNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "consumer pay link not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch pay link")
		return
	}

	respond(w, http.StatusOK, link)
}
