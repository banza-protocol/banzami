package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banza-protocol/banzami/services/api-gateway/internal/apierror"
	"github.com/banza-protocol/banzami/services/api-gateway/internal/service"
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

// POST /v1/consumers/{id}/suspend
func (h *ConsumerHandler) Suspend(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	consumer, err := h.svc.Suspend(r.Context(), id)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrConsumerNotFound):
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "consumer not found")
		case errors.Is(err, service.ErrConsumerStatusTransition):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "INVALID_TRANSITION", "cannot suspend a closed consumer")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not suspend consumer")
		}
		return
	}
	respond(w, http.StatusOK, consumer)
}

// POST /v1/consumers/{id}/close
func (h *ConsumerHandler) Close(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	consumer, err := h.svc.Close(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrConsumerNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "consumer not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not close consumer")
		return
	}
	respond(w, http.StatusOK, consumer)
}
