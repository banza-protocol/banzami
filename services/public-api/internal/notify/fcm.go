package notify

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync"

	"github.com/banzami/banzami/services/common/documents"
	"github.com/banzami/banzami/services/common/env"
	"github.com/banzami/banzami/services/common/obs"
	"github.com/banzami/banzami/services/common/pushtopic"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

// sender is the part of the Firebase messaging client this service uses; a
// test replaces it to see what would be sent.
type sender interface {
	Send(ctx context.Context, message *messaging.Message) (string, error)
}

// FCMService wraps the Firebase Cloud Messaging client for the public-api.
// A nil receiver is safe — all methods become no-ops when FCM is disabled
// (FIREBASE_CREDENTIALS_JSON not set).
//
// Topics are named by [pushtopic.Namer] (A6-06): a keyed hash of the account
// id, never the id itself. Without PUSH_TOPIC_KEY there is no topic and every
// topic send is skipped — there is no fallback to a guessable name.
type FCMService struct {
	client      sender
	environment string // "PRODUCTION" or "SANDBOX"
	topics      *pushtopic.Namer
	noTopicOnce sync.Once
}

// NewFCMService initialises the FCM client from a JSON service-account string.
// Returns nil (disabled) when credentialsJSON is empty so public-api starts
// cleanly in environments without Firebase configured. topics names the
// topics to publish to; nil (no PUSH_TOPIC_KEY) skips every topic send.
func NewFCMService(ctx context.Context, credentialsJSON, environment string, topics *pushtopic.Namer) (*FCMService, error) {
	if credentialsJSON == "" {
		slog.Warn("[FCM] FIREBASE_CREDENTIALS_JSON not set — push notifications disabled")
		return nil, nil
	}

	// Extract project_id from the credentials JSON for startup verification.
	// A SenderId mismatch means this project_id does not match the mobile app's Firebase project.
	var sa struct {
		ProjectID   string `json:"project_id"`
		ClientEmail string `json:"client_email"`
	}
	if err := json.Unmarshal([]byte(credentialsJSON), &sa); err != nil {
		slog.Warn("[FCM] could not parse credentials for logging", "error", err)
	} else {
		slog.Info("[FCM] credentials loaded",
			"project_id", sa.ProjectID,
			"client_email", sa.ClientEmail,
			"environment", environment,
		)
	}

	app, err := firebase.NewApp(ctx, nil, option.WithCredentialsJSON([]byte(credentialsJSON)))
	if err != nil {
		return nil, fmt.Errorf("fcm: init firebase app: %w", err)
	}
	client, err := app.Messaging(ctx)
	if err != nil {
		return nil, fmt.Errorf("fcm: init messaging client: %w", err)
	}
	slog.Info("[FCM] initialized", "environment", environment, "topics", topics != nil)
	return &FCMService{client: client, environment: environment, topics: topics}, nil
}

func (s *FCMService) isSandbox() bool {
	return s != nil && env.Parse(s.environment).IsSandbox()
}

// topicForConsumer is the consumer's keyed topic; false when there is none
// (no PUSH_TOPIC_KEY), and the send must be skipped.
func (s *FCMService) topicForConsumer(consumerID string) (string, bool) {
	topic, ok := s.topics.Consumer(consumerID)
	if !ok {
		s.warnNoTopic()
	}
	return topic, ok
}

// topicForMerchant is the Business's keyed topic — the same one the gateway
// publishes to (both services hold the same PUSH_TOPIC_KEY).
func (s *FCMService) topicForMerchant(merchantID string) (string, bool) {
	topic, ok := s.topics.Merchant(merchantID)
	if !ok {
		s.warnNoTopic()
	}
	return topic, ok
}

func (s *FCMService) warnNoTopic() {
	if s.topics != nil {
		return // a key, but no id: nothing to announce
	}
	s.noTopicOnce.Do(func() {
		slog.Warn("[FCM] " + pushtopic.EnvVar + " not set — topic push notifications are skipped")
	})
}

func (s *FCMService) sandboxPrefix() string {
	if s.isSandbox() {
		return "[SANDBOX] "
	}
	return ""
}

// apnsConfig builds an APNSConfig with explicit priority-10 delivery and alert.
// Firebase's default topic priority can be deferred by iOS — setting apns-priority: 10
// ensures immediate delivery consistent with Android's "high" priority.
func apnsConfig(title, body string) *messaging.APNSConfig {
	return &messaging.APNSConfig{
		Headers: map[string]string{
			"apns-priority": "10",
		},
		Payload: &messaging.APNSPayload{
			Aps: &messaging.Aps{
				Alert: &messaging.ApsAlert{
					Title: title,
					Body:  body,
				},
				Sound: "default",
			},
		},
	}
}

// transferReceivedTitle names a person-to-person transfer — never a
// "pagamento" (that is a Business's).
const transferReceivedTitle = "Transferência recebida"

// receivedBody is "Recebeu 2 000 Kz de @ana", in the Banzami money format; with
// no payer handle it ends at the amount.
func receivedBody(amountMinor int64, currency, payerHandle string) string {
	body := "Recebeu " + documents.FormatAmount(amountMinor, currency)
	if h := strings.TrimPrefix(strings.TrimSpace(payerHandle), "@"); h != "" {
		body += " de @" + h
	}
	return body
}

// SendPaymentReceived notifies a consumer that they received a transfer.
// Runs best-effort — errors are logged, never returned.
func (s *FCMService) SendPaymentReceived(ctx context.Context, recipientConsumerID, senderHandle string, amountMinor int64, currency, transferID string) {
	if s == nil {
		return
	}
	topic, ok := s.topicForConsumer(recipientConsumerID)
	if !ok {
		return
	}
	prefix := s.sandboxPrefix()
	title := prefix + transferReceivedTitle
	body := receivedBody(amountMinor, currency, senderHandle)

	// Ids masked; the payer's handle and the amount are not logged (A6-14).
	slog.Info("[FCM] sending payment_received",
		"consumer_id", obs.MaskID(recipientConsumerID),
		"transfer_id", obs.MaskID(transferID),
	)

	msgID, err := s.client.Send(ctx, &messaging.Message{
		Notification: &messaging.Notification{Title: title, Body: body},
		Data: map[string]string{
			"type":          "payment_received",
			"environment":   s.environment,
			"transfer_id":   transferID,
			"sender_handle": senderHandle,
			"amount_minor":  strconv.FormatInt(amountMinor, 10),
			"currency":      currency,
			"route":         "receipt",
		},
		Android: &messaging.AndroidConfig{Priority: "high"},
		APNS:    apnsConfig(title, body),
		Topic:   topic,
	})
	if err != nil {
		slog.Error("[FCM] payment_received send failed",
			"consumer_id", obs.MaskID(recipientConsumerID),
			"error", err,
		)
	} else {
		slog.Info("[FCM] payment_received sent", "message_id", msgID)
	}
}

// SendPaymentLinkPaid notifies a merchant that their payment link was paid.
// Runs best-effort — errors are logged, never returned.
func (s *FCMService) SendPaymentLinkPaid(ctx context.Context, merchantID string, amountMinor int64, currency string) {
	if s == nil {
		return
	}
	topic, ok := s.topicForMerchant(merchantID)
	if !ok {
		return
	}
	prefix := s.sandboxPrefix()

	slog.Info("[FCM] sending payment_link_paid", "merchant_id", obs.MaskID(merchantID))

	// The Business App routes payment_link_paid like payment_received
	// (apps/mobile merchant_notification_router.dart paymentTypes).
	title := prefix + "Pagamento recebido"
	body := receivedBody(amountMinor, currency, "")

	msgID, err := s.client.Send(ctx, &messaging.Message{
		Notification: &messaging.Notification{Title: title, Body: body},
		Data: map[string]string{
			"type":         "payment_link_paid",
			"environment":  s.environment,
			"amount_minor": strconv.FormatInt(amountMinor, 10),
			"currency":     currency,
			"route":        "activity",
		},
		Android: &messaging.AndroidConfig{Priority: "high"},
		APNS:    apnsConfig(title, body),
		Topic:   topic,
	})
	if err != nil {
		slog.Error("[FCM] payment_link_paid send failed",
			"merchant_id", obs.MaskID(merchantID),
			"error", err,
		)
	} else {
		slog.Info("[FCM] payment_link_paid sent", "message_id", msgID)
	}
}

// SendPaymentRequestPaid notifies a consumer that their payment request (pay link) was paid.
// Semantically identical to SendPaymentReceived from the recipient's perspective.
// Runs best-effort — errors are logged, never returned.
func (s *FCMService) SendPaymentRequestPaid(ctx context.Context, recipientConsumerID, senderHandle string, amountMinor int64, currency, transferID string) {
	if s == nil {
		return
	}
	topic, ok := s.topicForConsumer(recipientConsumerID)
	if !ok {
		return
	}
	prefix := s.sandboxPrefix()
	// A paid payment request is a person-to-person transfer. The payer's
	// handle may be unknown: the body then ends at the amount, never "de ".
	body := receivedBody(amountMinor, currency, senderHandle)

	slog.Info("[FCM] sending payment_request_paid",
		"consumer_id", obs.MaskID(recipientConsumerID),
		"transfer_id", obs.MaskID(transferID),
	)

	title := prefix + transferReceivedTitle

	msgID, err := s.client.Send(ctx, &messaging.Message{
		Notification: &messaging.Notification{Title: title, Body: body},
		Data: map[string]string{
			"type":          "payment_received",
			"environment":   s.environment,
			"transfer_id":   transferID,
			"sender_handle": senderHandle,
			"amount_minor":  strconv.FormatInt(amountMinor, 10),
			"currency":      currency,
			"route":         "receipt",
		},
		Android: &messaging.AndroidConfig{Priority: "high"},
		APNS:    apnsConfig(title, body),
		Topic:   topic,
	})
	if err != nil {
		slog.Error("[FCM] payment_request_paid send failed",
			"consumer_id", obs.MaskID(recipientConsumerID),
			"error", err,
		)
	} else {
		slog.Info("[FCM] payment_request_paid sent", "message_id", msgID)
	}
}

// SendDebugPush sends a test push to a consumer's FCM topic.
// Intended for the SANDBOX debug endpoint only.
// Returns the Firebase message ID and topic for inspection.
func (s *FCMService) SendDebugPush(ctx context.Context, recipientConsumerID string) (messageID, topic string, err error) {
	if s == nil {
		return "", "", fmt.Errorf("FCM not initialized — FIREBASE_CREDENTIALS_JSON not set")
	}
	topic, ok := s.topicForConsumer(recipientConsumerID)
	if !ok {
		return "", "", fmt.Errorf("push topics disabled — %s not set", pushtopic.EnvVar)
	}
	title := s.sandboxPrefix() + "Debug: Push funcionando ✓"
	body := "Notificações estão a funcionar correctamente."

	slog.Info("[FCM] sending debug push (topic)", "consumer_id", obs.MaskID(recipientConsumerID))

	msgID, sendErr := s.client.Send(ctx, &messaging.Message{
		Notification: &messaging.Notification{Title: title, Body: body},
		Data: map[string]string{
			"type":        "debug",
			"environment": s.environment,
			"route":       "history",
		},
		Android: &messaging.AndroidConfig{Priority: "high"},
		APNS:    apnsConfig(title, body),
		Topic:   topic,
	})
	if sendErr != nil {
		slog.Error("[FCM] debug push (topic) failed", "consumer_id", obs.MaskID(recipientConsumerID), "error", sendErr)
		return "", topic, sendErr
	}
	slog.Info("[FCM] debug push (topic) sent", "message_id", msgID)
	return msgID, topic, nil
}

// SendDebugPushToToken sends a test push directly to an FCM registration token.
// Direct token delivery bypasses topic fanout — useful to isolate whether the
// issue is topic subscription or APNs/device delivery.
// Intended for the SANDBOX debug endpoint only.
func (s *FCMService) SendDebugPushToToken(ctx context.Context, fcmToken string) (messageID string, err error) {
	if s == nil {
		return "", fmt.Errorf("FCM not initialized — FIREBASE_CREDENTIALS_JSON not set")
	}
	title := s.sandboxPrefix() + "Debug (token): Push funcionando ✓"
	body := "Entrega directa via token — tópico não necessário."

	slog.Info("[FCM] sending debug push (token)", "token_prefix", fcmToken[:min(len(fcmToken), 8)])

	msgID, sendErr := s.client.Send(ctx, &messaging.Message{
		Notification: &messaging.Notification{Title: title, Body: body},
		Data: map[string]string{
			"type":        "debug",
			"environment": s.environment,
			"route":       "history",
		},
		Android: &messaging.AndroidConfig{Priority: "high"},
		APNS:    apnsConfig(title, body),
		Token:   fcmToken,
	})
	if sendErr != nil {
		slog.Error("[FCM] debug push (token) failed", "error", sendErr)
		return "", sendErr
	}
	slog.Info("[FCM] debug push (token) sent", "message_id", msgID)
	return msgID, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
