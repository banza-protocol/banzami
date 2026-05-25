package notify

import (
	"context"
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

// SendPaymentReceived notifies a consumer that they received a transfer.
// Runs best-effort — errors are logged, never returned.
func (s *FCMService) SendPaymentReceived(ctx context.Context, recipientConsumerID, senderHandle string, amountMinor int64, currency string) {
	if s == nil {
		return
	}
	prefix := s.sandboxPrefix()
	topic  := s.topicForConsumer(recipientConsumerID)
	body   := fmt.Sprintf("Recebeu %s de %s", formatAmount(amountMinor, currency), senderHandle)

	slog.Info("[FCM] sending payment_received",
		"topic",        topic,
		"consumer_id",  recipientConsumerID,
		"sender",       senderHandle,
		"amount_minor", amountMinor,
	)

	_, err := s.client.Send(ctx, &messaging.Message{
		Notification: &messaging.Notification{
			Title: prefix + "Pagamento recebido",
			Body:  body,
		},
		Data: map[string]string{
			"type":          "payment_received",
			"environment":   s.environment,
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
		slog.Error("[FCM] payment_received send failed",
			"consumer_id", recipientConsumerID,
			"error", err,
		)
	} else {
		slog.Info("[FCM] payment_received sent", "topic", topic)
	}
}

// SendPaymentLinkPaid notifies a merchant that their payment link was paid.
// Runs best-effort — errors are logged, never returned.
func (s *FCMService) SendPaymentLinkPaid(ctx context.Context, merchantID string, amountMinor int64, currency string) {
	if s == nil {
		return
	}
	prefix := s.sandboxPrefix()
	topic  := s.topicForMerchant(merchantID)

	slog.Info("[FCM] sending payment_link_paid",
		"topic",        topic,
		"merchant_id",  merchantID,
		"amount_minor", amountMinor,
	)

	_, err := s.client.Send(ctx, &messaging.Message{
		Notification: &messaging.Notification{
			Title: prefix + "Pagamento recebido",
			Body:  formatAmount(amountMinor, currency),
		},
		Data: map[string]string{
			"type":         "payment_link_paid",
			"environment":  s.environment,
			"amount_minor": strconv.FormatInt(amountMinor, 10),
			"currency":     currency,
			"route":        "activity",
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
		slog.Error("[FCM] payment_link_paid send failed",
			"merchant_id", merchantID,
			"error", err,
		)
	} else {
		slog.Info("[FCM] payment_link_paid sent", "topic", topic)
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
