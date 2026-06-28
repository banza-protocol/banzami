package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// CollectionHandler exposes BANZA Collections (ADR-036) + PaymentIntent (ADR-037)
// to merchants. It is a thin auth/scoping layer: merchant_id and environment are
// ALWAYS taken from the merchant principal (never the client body), so the core
// enforces tenant + environment isolation and returns 404 on cross-tenant access.
type CollectionHandler struct {
	svc service.CollectionService
}

func NewCollectionHandler(svc service.CollectionService) *CollectionHandler {
	return &CollectionHandler{svc: svc}
}

// merchantScope returns the authenticated merchant id + environment, or false
// (with a 403 already written) if the principal is not a merchant.
func (h *CollectionHandler) merchantScope(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
			"only merchant accounts may use collections")
		return "", "", false
	}
	return principal.MerchantID, principal.Environment, true
}

func colDecodeBody(r *http.Request) (map[string]any, error) {
	if r.Body == nil {
		return map[string]any{}, nil
	}
	var body map[string]any
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&body); err != nil {
		return nil, err
	}
	if body == nil {
		body = map[string]any{}
	}
	return body, nil
}

func colWriteRaw(w http.ResponseWriter, status int, raw json.RawMessage) {
	w.Header().Set("Content-Type", "application/json")
	if status == 0 {
		status = http.StatusBadGateway
	}
	w.WriteHeader(status)
	_, _ = w.Write(raw)
}

func (h *CollectionHandler) forwardErr(w http.ResponseWriter, r *http.Request, err error) {
	apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR",
		"collections service is unavailable")
	_ = err
}

func (h *CollectionHandler) Create(w http.ResponseWriter, r *http.Request) {
	merchant, env, ok := h.merchantScope(w, r)
	if !ok {
		return
	}
	body, err := colDecodeBody(r)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid JSON body")
		return
	}
	status, raw, err := h.svc.Create(r.Context(), merchant, env, body)
	if err != nil {
		h.forwardErr(w, r, err)
		return
	}
	colWriteRaw(w, status, raw)
}

func (h *CollectionHandler) Get(w http.ResponseWriter, r *http.Request) {
	merchant, env, ok := h.merchantScope(w, r)
	if !ok {
		return
	}
	status, raw, err := h.svc.Get(r.Context(), merchant, env, chi.URLParam(r, "id"))
	if err != nil {
		h.forwardErr(w, r, err)
		return
	}
	colWriteRaw(w, status, raw)
}

func (h *CollectionHandler) List(w http.ResponseWriter, r *http.Request) {
	merchant, env, ok := h.merchantScope(w, r)
	if !ok {
		return
	}
	status, raw, err := h.svc.List(r.Context(), merchant, env, r.URL.RawQuery)
	if err != nil {
		h.forwardErr(w, r, err)
		return
	}
	colWriteRaw(w, status, raw)
}

func (h *CollectionHandler) Update(w http.ResponseWriter, r *http.Request) {
	merchant, env, ok := h.merchantScope(w, r)
	if !ok {
		return
	}
	body, err := colDecodeBody(r)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid JSON body")
		return
	}
	status, raw, err := h.svc.Update(r.Context(), merchant, env, chi.URLParam(r, "id"), body)
	if err != nil {
		h.forwardErr(w, r, err)
		return
	}
	colWriteRaw(w, status, raw)
}

func (h *CollectionHandler) Close(w http.ResponseWriter, r *http.Request) {
	merchant, env, ok := h.merchantScope(w, r)
	if !ok {
		return
	}
	status, raw, err := h.svc.Close(r.Context(), merchant, env, chi.URLParam(r, "id"))
	if err != nil {
		h.forwardErr(w, r, err)
		return
	}
	colWriteRaw(w, status, raw)
}

func (h *CollectionHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	merchant, env, ok := h.merchantScope(w, r)
	if !ok {
		return
	}
	status, raw, err := h.svc.Cancel(r.Context(), merchant, env, chi.URLParam(r, "id"))
	if err != nil {
		h.forwardErr(w, r, err)
		return
	}
	colWriteRaw(w, status, raw)
}

func (h *CollectionHandler) CreateShare(w http.ResponseWriter, r *http.Request) {
	merchant, env, ok := h.merchantScope(w, r)
	if !ok {
		return
	}
	body, err := colDecodeBody(r)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid JSON body")
		return
	}
	status, raw, err := h.svc.CreateShare(r.Context(), merchant, env, chi.URLParam(r, "id"), body)
	if err != nil {
		h.forwardErr(w, r, err)
		return
	}
	colWriteRaw(w, status, raw)
}

func (h *CollectionHandler) ListShares(w http.ResponseWriter, r *http.Request) {
	merchant, env, ok := h.merchantScope(w, r)
	if !ok {
		return
	}
	status, raw, err := h.svc.ListShares(r.Context(), merchant, env, chi.URLParam(r, "id"), r.URL.RawQuery)
	if err != nil {
		h.forwardErr(w, r, err)
		return
	}
	colWriteRaw(w, status, raw)
}

func (h *CollectionHandler) Events(w http.ResponseWriter, r *http.Request) {
	merchant, env, ok := h.merchantScope(w, r)
	if !ok {
		return
	}
	status, raw, err := h.svc.Events(r.Context(), merchant, env, chi.URLParam(r, "id"))
	if err != nil {
		h.forwardErr(w, r, err)
		return
	}
	colWriteRaw(w, status, raw)
}

func (h *CollectionHandler) SurfaceShare(w http.ResponseWriter, r *http.Request) {
	merchant, env, ok := h.merchantScope(w, r)
	if !ok {
		return
	}
	body, err := colDecodeBody(r)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid JSON body")
		return
	}
	status, raw, err := h.svc.SurfaceShare(r.Context(), merchant, env, chi.URLParam(r, "id"), body)
	if err != nil {
		h.forwardErr(w, r, err)
		return
	}
	colWriteRaw(w, status, raw)
}
