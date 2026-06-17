package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// SplitHandler proxies split-payment (P2P-002) routes to the core, forwarding
// the core's status + body verbatim so the app sees exact outcome codes.
type SplitHandler struct {
	svc service.SplitService
}

func NewSplitHandler(svc service.SplitService) *SplitHandler {
	return &SplitHandler{svc: svc}
}

func readBody(w http.ResponseWriter, r *http.Request) (json.RawMessage, bool) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil || len(raw) == 0 {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body is required")
		return nil, false
	}
	if !json.Valid(raw) {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return nil, false
	}
	return raw, true
}

// POST /v1/splits — open a split session.
func (h *SplitHandler) Create(w http.ResponseWriter, r *http.Request) {
	body, ok := readBody(w, r)
	if !ok {
		return
	}
	status, raw, err := h.svc.Create(r.Context(), body)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "split could not be created")
		return
	}
	writeRaw(w, status, raw)
}

// GET /v1/splits/{id} — session state + contributions.
func (h *SplitHandler) Get(w http.ResponseWriter, r *http.Request) {
	raw, err := h.svc.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "split session not found")
			return
		}
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "split could not be fetched")
		return
	}
	writeRaw(w, http.StatusOK, raw)
}

// POST /v1/splits/{id}/pay — contribute a portion to the split.
func (h *SplitHandler) Pay(w http.ResponseWriter, r *http.Request) {
	body, ok := readBody(w, r)
	if !ok {
		return
	}
	status, raw, err := h.svc.Pay(r.Context(), chi.URLParam(r, "id"), body)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "split payment could not be processed")
		return
	}
	writeRaw(w, status, raw)
}
