package handler

import (
	"net/http"

	"github.com/banzami/banzami/services/common/pushtopic"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
)

// PushTopicHandler tells a signed-in Business which FCM topic its payment
// notifications are published to (A6-06).
//
// The topic is a keyed hash of the merchant id (services/common/pushtopic),
// the same name this gateway and public-api publish to: it cannot be derived
// from the merchant id, which public surfaces disclose, and this authenticated
// route is the only place it is given — to the Business it belongs to. The
// Business App subscribes to what it is told here and never computes a topic.
type PushTopicHandler struct {
	topics *pushtopic.Namer
}

func NewPushTopicHandler(topics *pushtopic.Namer) *PushTopicHandler {
	return &PushTopicHandler{topics: topics}
}

// GET /v1/merchant/push-topic
//
//	200 {"topic": "m_<32 hex>"}        (Sandbox: "sandbox_m_<32 hex>")
//	200 {"topic": null}                push topics are not configured here
//	401 / 403                          no Business session
func (h *PushTopicHandler) Merchant(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant authentication required")
		return
	}
	var topic any // null: no topic, subscribe to nothing
	if t, named := h.topics.Merchant(principal.MerchantID); named {
		topic = t
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"topic": topic})
}
