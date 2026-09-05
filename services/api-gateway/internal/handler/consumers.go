package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type ConsumerHandler struct {
	svc service.ConsumerService
}

func NewConsumerHandler(svc service.ConsumerService) *ConsumerHandler {
	return &ConsumerHandler{svc: svc}
}

// POST /v1/consumers
func (h *ConsumerHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Handle      string  `json:"handle"`
		DisplayName *string `json:"display_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if body.Handle == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "handle is required")
		return
	}

	consumer, err := h.svc.Create(r.Context(), body.Handle, body.DisplayName)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrHandleTaken):
			apierror.Respond(w, r, http.StatusConflict, "HANDLE_TAKEN", "handle is already registered")
		case errors.Is(err, service.ErrInvalidHandle):
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_HANDLE", err.Error())
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not create consumer")
		}
		return
	}

	respond(w, http.StatusCreated, consumer)
}

// GET /v1/consumers/{id}
func (h *ConsumerHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	consumer, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrConsumerNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "consumer not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch consumer")
		return
	}
	respond(w, http.StatusOK, consumer)
}

// GET /v1/consumers/handle/{handle}
// ResolveHandleForProject answers "does this @banza exist, and what is it
// called?" for a Developer Platform credential.
//
// The merchant-only GetByHandle could not serve this: a project key cannot reach
// it, so an application built on the Developer Platform had no way to check a
// beneficiary handle before paying it. DOA's campaign form does exactly that —
// it asks the owner for the @banza that will receive the Kwanzas and validates
// it before publishing — and it was failing with "unavailable" because the only
// route for the question required the credential the platform withholds.
//
// It returns the minimum that answers the question: the handle, its display
// name, and nothing else. No consumer id, no wallet, no balance. Confirming that
// a handle exists is what a payer needs; anything more would make this a
// directory of strangers' accounts.
func (h *ConsumerHandler) ResolveHandleForProject(w http.ResponseWriter, r *http.Request) {
	if dp, isDev := middleware.GetDeveloperPrincipal(r.Context()); isDev {
		if !dp.HasScope("customers:read") {
			apierror.Respond(w, r, http.StatusForbidden, "INSUFFICIENT_SCOPE",
				"missing required scope: customers:read")
			return
		}
	} else if principal, ok := middleware.GetPrincipal(r.Context()); !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid credentials required")
		return
	}

	handle := chi.URLParam(r, "handle")
	consumer, err := h.svc.GetByHandle(r.Context(), handle)
	if err != nil {
		if errors.Is(err, service.ErrHandleNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "handle not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"could not resolve handle")
		return
	}
	respond(w, http.StatusOK, map[string]any{
		"handle":       consumer.Handle,
		"display_name": consumer.DisplayName,
	})
}

func (h *ConsumerHandler) GetByHandle(w http.ResponseWriter, r *http.Request) {
	handle := chi.URLParam(r, "handle")
	consumer, err := h.svc.GetByHandle(r.Context(), handle)
	if err != nil {
		if errors.Is(err, service.ErrHandleNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "handle not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch consumer")
		return
	}
	respond(w, http.StatusOK, consumer)
}

// The consumer SUSPEND and CLOSE handlers were REMOVED from this surface
// (security audit SEC-003). They performed no authorisation whatsoever, so any
// authenticated principal could suspend or close ANY consumer account by id.
// The handlers are deleted rather than merely unmounted so they cannot be
// re-registered by accident; a route-table regression test
// (TestMerchantSurface_ConsumerLifecycleRoutesNotMounted) asserts they stay off
// the merchant surface.
//
// The capability lives on the operator surface, where it can be authorised and
// audited: admin-api POST /admin/v1/consumers/{id}/suspend, gated by the
// consumer.suspend capability, which reaches core via
// /internal/v1/consumers/{id}/suspend.
