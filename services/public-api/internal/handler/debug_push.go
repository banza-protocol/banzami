package handler

import (
	"net/http"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/notify"
)

// DebugPushHandler provides a manual push-notification test endpoint.
// Only available in SANDBOX — returns 403 in PRODUCTION.
type DebugPushHandler struct {
	fcm         *notify.FCMService
	environment string
}

func NewDebugPushHandler(fcm *notify.FCMService, environment string) *DebugPushHandler {
	return &DebugPushHandler{fcm: fcm, environment: environment}
}

// POST /v1/debug/push-test
// Sends a test FCM push to the authenticated consumer's topic.
// Returns the topic and Firebase message ID so callers can verify end-to-end delivery.
func (h *DebugPushHandler) PushTest(w http.ResponseWriter, r *http.Request) {
	if h.environment != "SANDBOX" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
			"debug endpoints are only available in sandbox")
		return
	}

	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	msgID, topic, err := h.fcm.SendDebugPush(r.Context(), consumer.ID)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "FCM_ERROR", err.Error())
		return
	}

	respond(w, http.StatusOK, map[string]any{
		"consumer_id":         consumer.ID,
		"environment":         h.environment,
		"fcm_topic":           topic,
		"firebase_message_id": msgID,
	})
}
