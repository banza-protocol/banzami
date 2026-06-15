package notify

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"strings"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

// FCMService wraps the Firebase Cloud Messaging client.
// A nil receiver is safe to call — all methods become no-ops when FCM is
// disabled (FIREBASE_CREDENTIALS_JSON not set).
type FCMService struct {
	client      *messaging.Client
	environment string // "production", "development", "sandbox", etc.
}

// NewFCMService initialises the FCM client from a JSON service-account string.
// Returns nil (disabled, no error) when credentialsJSON is empty so the
// gateway starts cleanly in local-dev environments without Firebase.
func NewFCMService(ctx context.Context, credentialsJSON, environment string) (*FCMService, error) {
	if credentialsJSON == "" {
		return nil, nil
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
	return s != nil && (s.environment == "sandbox" || s.environment == "SANDBOX")
}

func (s *FCMService) topicForConsumer(consumerID string) string {
	if s.isSandbox() {
		return "sandbox_consumer_" + consumerID
	}
	return "consumer_" + consumerID
}

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

// SendToConsumer publishes a payment_received push to a consumer's FCM topic.
// Errors are logged but never propagated — push notifications are best-effort.
func (s *FCMService) SendToConsumer(ctx context.Context, consumerID, title, body string) {
	if s == nil {
		return
	}
	topic := s.topicForConsumer(consumerID)
	prefix := s.sandboxPrefix()
	slog.Info("[FCM] sending to consumer", "topic", topic, "title", title)
	_, err := s.client.Send(ctx, &messaging.Message{
		Notification: &messaging.Notification{
			Title: prefix + title,
			Body:  body,
		},
		Data: map[string]string{
			"type":        "payment_received",
			"environment": s.environment,
			"route":       "activity",
		},
		Android: &messaging.AndroidConfig{Priority: "high"},
		APNS: &messaging.APNSConfig{
			Payload: &messaging.APNSPayload{
				Aps: &messaging.Aps{Sound: "default"},
			},
		},
		Topic: topic,
	})
	if err != nil {
		slog.Error("[FCM] consumer notification failed",
			"consumer_id", consumerID,
			"error", err,
		)
	} else {
		slog.Info("[FCM] consumer notification sent", "topic", topic)
	}
}

// SendPaymentReceived publishes a detailed payment_received push with data payload.
func (s *FCMService) SendPaymentReceived(ctx context.Context, consumerID, senderHandle string, amountMinor int64, currency, transferID string) {
	if s == nil {
		return
	}
	prefix := s.sandboxPrefix()
	topic  := s.topicForConsumer(consumerID)
	body   := fmt.Sprintf("Recebeu %s de %s", formatAmount(amountMinor, currency), senderHandle)

	slog.Info("[FCM] sending payment_received",
		"topic",        topic,
		"consumer_id",  consumerID,
		"sender",       senderHandle,
		"amount_minor", amountMinor,
		"transfer_id",  transferID,
	)

	_, err := s.client.Send(ctx, &messaging.Message{
		Notification: &messaging.Notification{
			Title: prefix + "Pagamento recebido",
			Body:  body,
		},
		Data: map[string]string{
			"type":          "payment_received",
			"environment":   s.environment,
			"transfer_id":   transferID,
			"sender_handle": senderHandle,
			"amount_minor":  strconv.FormatInt(amountMinor, 10),
			"currency":      currency,
			"route":         "activity",
		},
		Android: &messaging.AndroidConfig{Priority: "high"},
		APNS: &messaging.APNSConfig{
			Payload: &messaging.APNSPayload{
				Aps: &messaging.Aps{Sound: "default"},
			},
		},
		Topic: topic,
	})
	if err != nil {
		slog.Error("[FCM] payment_received failed",
			"consumer_id", consumerID,
			"error", err,
		)
	} else {
		slog.Info("[FCM] payment_received sent", "topic", topic)
	}
}

// SendToMerchant publishes a push notification to the FCM topic for a merchant.
func (s *FCMService) SendToMerchant(ctx context.Context, merchantID, title, body string) {
	if s == nil {
		return
	}
	prefix := s.sandboxPrefix()
	topic  := s.topicForMerchant(merchantID)
	slog.Info("[FCM] sending to merchant", "topic", topic, "title", title)
	_, err := s.client.Send(ctx, &messaging.Message{
		Notification: &messaging.Notification{
			Title: prefix + title,
			Body:  body,
		},
		Data: map[string]string{
			"type":        "payment_link_paid",
			"environment": s.environment,
			"route":       "activity",
		},
		Android: &messaging.AndroidConfig{Priority: "high"},
		APNS: &messaging.APNSConfig{
			Payload: &messaging.APNSPayload{
				Aps: &messaging.Aps{Sound: "default"},
			},
		},
		Topic: topic,
	})
	if err != nil {
		slog.Error("[FCM] merchant notification failed",
			"merchant_id", merchantID,
			"error", err,
		)
	} else {
		slog.Info("[FCM] merchant notification sent", "topic", topic)
	}
}

// SendPaymentToMerchant publishes a payment-received push to the merchant topic
// with the value and, when the payer is a Banzami wallet, their @banza handle.
// For external (acquiring) payers, payerHandle is empty and the body shows the
// value only. Carries a data payload so the app can render value + payer exactly.
func (s *FCMService) SendPaymentToMerchant(ctx context.Context, merchantID, payerHandle string, amountMinor int64, currency string) {
	if s == nil {
		return
	}
	prefix := s.sandboxPrefix()
	topic  := s.topicForMerchant(merchantID)
	amount := formatAmount(amountMinor, currency)
	body   := "Recebeu " + amount
	if payerHandle != "" {
		body += " de @" + strings.TrimPrefix(payerHandle, "@")
	}
	_, err := s.client.Send(ctx, &messaging.Message{
		Notification: &messaging.Notification{Title: prefix + "Pagamento recebido", Body: body},
		Data: map[string]string{
			"type":         "payment_received",
			"environment":  s.environment,
			"amount_minor": strconv.FormatInt(amountMinor, 10),
			"currency":     currency,
			"payer_handle": payerHandle,
			"route":        "activity",
		},
		Android: &messaging.AndroidConfig{Priority: "high"},
		APNS: &messaging.APNSConfig{
			Payload: &messaging.APNSPayload{Aps: &messaging.Aps{Sound: "default"}},
		},
		Topic: topic,
	})
	if err != nil {
		slog.Error("[FCM] merchant payment notification failed", "merchant_id", merchantID, "error", err)
	} else {
		slog.Info("[FCM] merchant payment notification sent", "topic", topic, "has_handle", payerHandle != "")
	}
}

// formatAmount formats a minor-unit amount for notification body text.
func formatAmount(minor int64, currency string) string {
	whole := minor / 100
	frac  := minor % 100
	if currency == "AOA" {
		if frac == 0 {
			return fmt.Sprintf("%s Kz", insertSep(whole))
		}
		return fmt.Sprintf("%s,%02d Kz", insertSep(whole), frac)
	}
	return fmt.Sprintf("%s.%02d %s", insertSep(whole), frac, currency)
}

func insertSep(n int64) string {
	s   := strconv.FormatInt(n, 10)
	out := make([]byte, 0, len(s)+len(s)/3)
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, c)
	}
	return string(out)
}
