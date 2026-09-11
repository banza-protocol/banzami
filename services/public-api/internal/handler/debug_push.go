package handler

import (
	"encoding/json"
	"github.com/banzami/banzami/services/common/env"
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
// Sends a test FCM push to the authenticated consumer.
//
// Optional body: {"fcm_token": "<registration_token>"}
//   - With fcm_token: direct token delivery (bypasses topic fanout, faster, easier to debug)
//   - Without fcm_token: topic delivery (tests the full subscription path)
//
// Returns delivery_mode, target, and firebase_message_id.
func (h *DebugPushHandler) PushTest(w http.ResponseWriter, r *http.Request) {
	if !env.Parse(h.environment).IsSandbox() {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
			"debug endpoints are only available in sandbox")
		return
	}

	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	var body struct {
		FCMToken string `json:"fcm_token"`
	}
	json.NewDecoder(r.Body).Decode(&body) //nolint:errcheck // optional body

	var (
		msgID, deliveryMode, target string
		err                         error
	)

	if body.FCMToken != "" {
		// A caller-named device token let any Sandbox consumer send Banzami's
		// push, from Banzami's Firebase sender, to any device whose token it
		// had. The debug push goes to the caller's own devices only.
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD",
			"fcm_token is not accepted: the debug push goes to your own devices")
		return
	} else {
		var topic string
		msgID, topic, err = h.fcm.SendDebugPush(r.Context(), consumer.ID)
		deliveryMode = "topic"
		target = topic
	}

	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "FCM_ERROR", "the push could not be sent")
		return
	}

	respond(w, http.StatusOK, map[string]any{
		"consumer_id":         consumer.ID,
		"environment":         h.environment,
		"delivery_mode":       deliveryMode,
		"target":              target,
		"firebase_message_id": msgID,
	})
}
