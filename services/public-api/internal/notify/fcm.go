package notify

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

// FCMService wraps the Firebase Cloud Messaging client for the public-api.
// A nil receiver is safe — all methods become no-ops when FCM is disabled
// (FIREBASE_CREDENTIALS_JSON not set).
type FCMService struct {
	client      *messaging.Client
	environment string // "PRODUCTION" or "SANDBOX"
}

// NewFCMService initialises the FCM client from a JSON service-account string.
// Returns nil (disabled) when credentialsJSON is empty so public-api starts
// cleanly in environments without Firebase configured.
func NewFCMService(ctx context.Context, credentialsJSON, environment string) (*FCMService, error) {
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
	slog.Info("[FCM] initialized", "environment", environment)
	return &FCMService{client: client, environment: environment}, nil
}

func (s *FCMService) isSandbox() bool {
	return s != nil && s.environment == "SANDBOX"
}

// topicForConsumer returns the FCM topic for a consumer, with sandbox isolation.
func (s *FCMService) topicForConsumer(consumerID string) string {
	if s.isSandbox() {
		return "sandbox_consumer_" + consumerID
	}
	return "consumer_" + consumerID
}

// topicForMerchant returns the FCM topic for a merchant, with sandbox isolation.
func (s *FCMService) topicForMerchant(merchantID string) string {
	if s.isSandbox() {
		return "sandbox_merchant_" + merchantID
	}
	return "merchant_" + merchantID
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

// SendPaymentReceived notifies a consumer that they received a transfer.
// Runs best-effort — errors are logged, never returned.
func (s *FCMService) SendPaymentReceived(ctx context.Context, recipientConsumerID, senderHandle string, amountMinor int64, currency, transferID string) {
	if s == nil {
		return
	}
	prefix := s.sandboxPrefix()
	topic := s.topicForConsumer(recipientConsumerID)
	title := prefix + "Pagamento recebido"
	body := fmt.Sprintf("Recebeu %s de %s", formatAmount(amountMinor, currency), senderHandle)

	slog.Info("[FCM] sending payment_received",
		"topic", topic,
		"consumer_id", recipientConsumerID,
		"sender", senderHandle,
		"amount_minor", amountMinor,
		"transfer_id", transferID,
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
			"consumer_id", recipientConsumerID,
			"error", err,
		)
	} else {
		slog.Info("[FCM] payment_received sent", "topic", topic, "message_id", msgID)
	}
}

// SendPaymentLinkPaid notifies a merchant that their payment link was paid.
// Runs best-effort — errors are logged, never returned.
func (s *FCMService) SendPaymentLinkPaid(ctx context.Context, merchantID string, amountMinor int64, currency string) {
	if s == nil {
		return
	}
	prefix := s.sandboxPrefix()
	topic := s.topicForMerchant(merchantID)

	slog.Info("[FCM] sending payment_link_paid",
		"topic", topic,
		"merchant_id", merchantID,
		"amount_minor", amountMinor,
	)

	title := prefix + "Pagamento recebido"
	body := formatAmount(amountMinor, currency)

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
			"merchant_id", merchantID,
			"error", err,
		)
	} else {
		slog.Info("[FCM] payment_link_paid sent", "topic", topic, "message_id", msgID)
	}
}

// SendPaymentRequestPaid notifies a consumer that their payment request (pay link) was paid.
// Semantically identical to SendPaymentReceived from the recipient's perspective.
// Runs best-effort — errors are logged, never returned.
func (s *FCMService) SendPaymentRequestPaid(ctx context.Context, recipientConsumerID, senderHandle string, amountMinor int64, currency, transferID string) {
	if s == nil {
		return
	}
	prefix := s.sandboxPrefix()
	topic := s.topicForConsumer(recipientConsumerID)
	body := fmt.Sprintf("Recebeu %s de %s", formatAmount(amountMinor, currency), senderHandle)

	slog.Info("[FCM] sending payment_request_paid",
		"topic", topic,
		"consumer_id", recipientConsumerID,
		"sender", senderHandle,
		"amount_minor", amountMinor,
		"transfer_id", transferID,
	)

	title := prefix + "Pagamento recebido"

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
			"consumer_id", recipientConsumerID,
			"error", err,
		)
	} else {
		slog.Info("[FCM] payment_request_paid sent", "topic", topic, "message_id", msgID)
	}
}

// SendDebugPush sends a test push to a consumer's FCM topic.
// Intended for the SANDBOX debug endpoint only.
// Returns the Firebase message ID and topic for inspection.
func (s *FCMService) SendDebugPush(ctx context.Context, recipientConsumerID string) (messageID, topic string, err error) {
	if s == nil {
		return "", "", fmt.Errorf("FCM not initialized — FIREBASE_CREDENTIALS_JSON not set")
	}
	topic = s.topicForConsumer(recipientConsumerID)
	title := s.sandboxPrefix() + "Debug: Push funcionando ✓"
	body := "Notificações estão a funcionar correctamente."

	slog.Info("[FCM] sending debug push (topic)", "topic", topic, "consumer_id", recipientConsumerID)

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
		slog.Error("[FCM] debug push (topic) failed", "consumer_id", recipientConsumerID, "error", sendErr)
		return "", topic, sendErr
	}
	slog.Info("[FCM] debug push (topic) sent", "topic", topic, "message_id", msgID)
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

// formatAmount formats a minor-unit amount for notification body text.
func formatAmount(minor int64, currency string) string {
	whole := minor / 100
	frac := minor % 100
	if currency == "AOA" {
		if frac == 0 {
			return fmt.Sprintf("%s Kz", insertSep(whole))
		}
		return fmt.Sprintf("%s,%02d Kz", insertSep(whole), frac)
	}
	return fmt.Sprintf("%s.%02d %s", insertSep(whole), frac, currency)
}

func insertSep(n int64) string {
	s := strconv.FormatInt(n, 10)
	out := make([]byte, 0, len(s)+len(s)/3)
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, c)
	}
	return string(out)
}
