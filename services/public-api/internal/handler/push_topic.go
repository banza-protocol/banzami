package handler

import (
	"net/http"

	"github.com/banzami/banzami/services/common/pushtopic"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
)

// PushTopicHandler tells a signed-in consumer which FCM topic its
// notifications are published to (A6-06).
//
// The topic is a keyed hash of the consumer id (services/common/pushtopic):
// it cannot be derived from the id, and this authenticated route is the only
// place it is disclosed — to the consumer it belongs to. The app subscribes to
// what it is told here and never computes a topic itself.
type PushTopicHandler struct {
	topics *pushtopic.Namer
}

func NewPushTopicHandler(topics *pushtopic.Namer) *PushTopicHandler {
	return &PushTopicHandler{topics: topics}
}

// GET /v1/me/push-topic
//
//	200 {"topic": "c_<32 hex>"}        (Sandbox: "sandbox_c_<32 hex>")
//	200 {"topic": null}                push topics are not configured here
//	401 UNAUTHORIZED                   no consumer session
func (h *PushTopicHandler) Consumer(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}
	var topic any // null: no topic, subscribe to nothing
	if t, named := h.topics.Consumer(consumer.ID); named {
		topic = t
	}
	w.Header().Set("Cache-Control", "no-store")
	respond(w, http.StatusOK, map[string]any{"topic": topic})
}
