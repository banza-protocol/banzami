package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// WebhookHandler handles webhook endpoint management and event visibility routes.
type WebhookHandler struct {
	svc service.WebhookService
}

func NewWebhookHandler(svc service.WebhookService) *WebhookHandler {
	return &WebhookHandler{svc: svc}
}

// resolveWebhookAuthority answers "whose webhooks are these?" for either
// credential.
//
// Webhook management used to be merchant-JWT only, which meant an application
// built on the Developer Platform could not see or manage the endpoint that
// carries its own events — the Console showed illustrative rows, and the only
// way to register an endpoint was to hold a merchant credential. That is the
// authority level the Developer Platform exists to withhold, so "just use a
// merchant key" was never an answer.
//
// A developer key's merchant comes from its Project binding and nowhere else.
// There is deliberately no client-supplied merchant_id to honour or reject
// here: the field does not exist on these routes, so there is nothing for a
// caller to try. A merchant JWT keeps naming itself, exactly as before.
func (h *WebhookHandler) resolveWebhookAuthority(w http.ResponseWriter, r *http.Request, scope string) (string, bool) {
	if dp, isDev := middleware.GetDeveloperPrincipal(r.Context()); isDev {
		if !dp.HasScope(scope) {
			apierror.Respond(w, r, http.StatusForbidden, "INSUFFICIENT_SCOPE",
				"missing required scope: "+scope)
			return "", false
		}
		// An unbound project has no owner, so it has no webhooks — not an empty
		// list, which would imply the question was meaningful.
		if !dp.Bound || dp.MerchantID == "" {
			apierror.Respond(w, r, http.StatusForbidden, "PAYMENTS_UNAVAILABLE",
				"this project is not provisioned to hold funds")
			return "", false
		}
		return dp.MerchantID, true
	}
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
			"only merchant accounts may manage webhooks")
		return "", false
	}
	return principal.MerchantID, true
}

type registerEndpointBody struct {
	URL    string   `json:"url"`
	Events []string `json:"events"`
}

// Register handles POST /v1/webhooks/endpoints.
//
// The secret in the response is shown exactly once — store it immediately.
// After this call the secret cannot be retrieved; use the rotate endpoint (future) to reset it.
func (h *WebhookHandler) Register(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.resolveWebhookAuthority(w, r, "webhooks:write")
	if !ok {
		return
	}

	var body registerEndpointBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY",
			"request body must be valid JSON")
		return
	}

	switch {
	case body.URL == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "url is required")
		return
	case len(body.URL) > service.MaxWebhookURLLength:
		// RA-063 — bound the caller-controlled destination string.
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_WEBHOOK_URL",
			"url is too long")
		return
	case len(body.Events) == 0:
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD",
			"events must contain at least one event type (e.g. transaction.created)")
		return
	}

	// RA-062 — an unlisted event name is a typo, and silently accepting it
	// produces an endpoint that will never fire.
	for _, ev := range body.Events {
		if !service.SupportedWebhookEvents[ev] {
			apierror.Respond(w, r, http.StatusBadRequest, "UNSUPPORTED_EVENT",
				"one or more requested event types are not supported")
			return
		}
	}

	ep, err := h.svc.RegisterEndpoint(r.Context(), service.RegisterEndpointRequest{
		MerchantID: merchantID,
		URL:        body.URL,
		Events:     body.Events,
	})
	if err != nil {
		if errors.Is(err, service.ErrInvalidWebhookURL) {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_WEBHOOK_URL",
				"url must be a public https endpoint")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"endpoint could not be registered")
		return
	}

	respond(w, http.StatusCreated, ep)
}

// RotateSecret handles POST /v1/webhooks/endpoints/{id}/rotate-secret.
//
// The new secret is shown exactly once, like registration. The old one stops
// signing immediately; update the receiver before rotating, or accept a window
// where deliveries are signed with a secret the receiver does not yet hold.
func (h *WebhookHandler) RotateSecret(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.resolveWebhookAuthority(w, r, "webhooks:write")
	if !ok {
		return
	}
	ep, err := h.svc.RotateEndpointSecret(r.Context(), merchantID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrEndpointNotFound) {
			// Not FORBIDDEN: an endpoint belonging to another merchant must be
			// indistinguishable from one that does not exist, or the status code
			// becomes a way to enumerate other tenants' endpoint ids.
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "endpoint not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"secret could not be rotated")
		return
	}
	respond(w, http.StatusOK, ep)
}

// GetEndpoint handles GET /v1/webhooks/endpoints/{id}.
func (h *WebhookHandler) GetEndpoint(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.resolveWebhookAuthority(w, r, "webhooks:read")
	if !ok {
		return
	}

	ep, err := h.svc.GetEndpoint(r.Context(), merchantID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrEndpointNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "endpoint not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"endpoint could not be fetched")
		return
	}

	respond(w, http.StatusOK, ep)
}

// ListEndpoints handles GET /v1/webhooks/endpoints.
func (h *WebhookHandler) ListEndpoints(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.resolveWebhookAuthority(w, r, "webhooks:read")
	if !ok {
		return
	}

	endpoints, err := h.svc.ListEndpoints(r.Context(), merchantID)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"endpoints could not be listed")
		return
	}
	if endpoints == nil {
		endpoints = []*service.WebhookEndpoint{}
	}

	respond(w, http.StatusOK, map[string]any{"data": endpoints})
}

// DeactivateEndpoint handles DELETE /v1/webhooks/endpoints/{id}.
// Returns 204 No Content on success. Deactivated endpoints stop receiving events
// but are retained for audit purposes.
func (h *WebhookHandler) DeactivateEndpoint(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.resolveWebhookAuthority(w, r, "webhooks:write")
	if !ok {
		return
	}

	err := h.svc.DeactivateEndpoint(r.Context(), merchantID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrEndpointNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "endpoint not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"endpoint could not be deactivated")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ListEvents handles GET /v1/webhooks/events.
//
// Query parameters:
//   - limit  — 1–100, default 20
func (h *WebhookHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.resolveWebhookAuthority(w, r, "webhooks:read")
	if !ok {
		return
	}

	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM",
				"limit must be an integer between 1 and 100")
			return
		}
		limit = parsed
	}

	events, err := h.svc.ListEvents(r.Context(), merchantID, limit)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"events could not be listed")
		return
	}
	if events == nil {
		events = []*service.WebhookEvent{}
	}

	respond(w, http.StatusOK, map[string]any{"data": events})
}

// ListDeliveries handles GET /v1/webhooks/events/{id}/deliveries.
func (h *WebhookHandler) ListDeliveries(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.resolveWebhookAuthority(w, r, "webhooks:read")
	if !ok {
		return
	}

	deliveries, err := h.svc.ListDeliveries(r.Context(), merchantID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "event not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"deliveries could not be listed")
		return
	}
	if deliveries == nil {
		deliveries = []*service.WebhookDelivery{}
	}

	respond(w, http.StatusOK, map[string]any{"data": deliveries})
}

// ReplayDelivery handles POST /v1/webhooks/deliveries/{id}/replay.
//
// Re-queues a permanently-failed delivery as a new PENDING delivery.
// Useful for manual recovery after an endpoint outage.
func (h *WebhookHandler) ReplayDelivery(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.resolveWebhookAuthority(w, r, "webhooks:write")
	if !ok {
		return
	}

	delivery, err := h.svc.ReplayDelivery(r.Context(), merchantID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrEndpointNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "delivery not found")
			return
		}
		if errors.Is(err, service.ErrDeliveryAlreadyDelivered) {
			apierror.Respond(w, r, http.StatusConflict, "DELIVERY_ALREADY_SUCCEEDED",
				"this delivery already succeeded — replay is for one that failed")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"delivery could not be replayed")
		return
	}

	respond(w, http.StatusCreated, delivery)
}

// EndpointHealth handles GET /v1/webhooks/endpoints/{id}/health.
//
// Returns delivery success/failure stats for the endpoint in the last 24 hours.
func (h *WebhookHandler) EndpointHealth(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.resolveWebhookAuthority(w, r, "webhooks:read")
	if !ok {
		return
	}

	health, err := h.svc.EndpointHealth(r.Context(), merchantID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrEndpointNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "endpoint not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"health could not be fetched")
		return
	}

	respond(w, http.StatusOK, health)
}
