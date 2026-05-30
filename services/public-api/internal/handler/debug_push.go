package handler

import (
	"encoding/json"
	"net/http"

	"github.com/banza-protocol/banzami/services/public-api/internal/apierror"
	"github.com/banza-protocol/banzami/services/public-api/internal/middleware"
	"github.com/banza-protocol/banzami/services/public-api/internal/notify"
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

	var body struct {
		FCMToken string `json:"fcm_token"`
	}
	json.NewDecoder(r.Body).Decode(&body) //nolint:errcheck // optional body

	var (
		msgID, deliveryMode, target string
		err                         error
	)

	if body.FCMToken != "" {
		msgID, err = h.fcm.SendDebugPushToToken(r.Context(), body.FCMToken)
		deliveryMode = "token"
		cutoff := len(body.FCMToken)
		if cutoff > 12 {
			cutoff = 12
		}
		target = body.FCMToken[:cutoff] + "…"
	} else {
		var topic string
		msgID, topic, err = h.fcm.SendDebugPush(r.Context(), consumer.ID)
		deliveryMode = "topic"
		target = topic
	}

	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "FCM_ERROR", err.Error())
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
