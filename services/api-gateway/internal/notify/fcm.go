package notify

import (
	"context"
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

// FCMService wraps the Firebase Cloud Messaging client.
// A nil receiver is safe to call — all methods become no-ops when FCM is
// disabled (FIREBASE_CREDENTIALS_JSON not set).
//
// A Business's topic is named by [pushtopic.Namer] (A6-06): a keyed hash of
// the merchant id, the same name public-api publishes payment-link pushes to.
// Without PUSH_TOPIC_KEY there is no topic and the send is skipped — never a
// fallback to the guessable merchant_<id>.
type FCMService struct {
	client      sender
	environment string // "production", "development", "sandbox", etc.
	topics      *pushtopic.Namer
	noTopicOnce sync.Once
}

// NewFCMService initialises the FCM client from a JSON service-account string.
// Returns nil (disabled, no error) when credentialsJSON is empty so the
// gateway starts cleanly in local-dev environments without Firebase. topics
// names the topics to publish to; nil (no PUSH_TOPIC_KEY) skips every send.
func NewFCMService(ctx context.Context, credentialsJSON, environment string, topics *pushtopic.Namer) (*FCMService, error) {
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
	slog.Info("[FCM] initialized", "environment", environment, "topics", topics != nil)
	return &FCMService{client: client, environment: environment, topics: topics}, nil
}

func (s *FCMService) isSandbox() bool {
	return s != nil && env.Parse(s.environment).IsSandbox()
}

// topicForMerchant is the Business's keyed topic; false when there is none
// (no PUSH_TOPIC_KEY), and the send must be skipped.
func (s *FCMService) topicForMerchant(merchantID string) (string, bool) {
	topic, ok := s.topics.Merchant(merchantID)
	if !ok && s.topics == nil {
		s.noTopicOnce.Do(func() {
			slog.Warn("[FCM] " + pushtopic.EnvVar + " not set — topic push notifications are skipped")
		})
	}
	return topic, ok
}

func (s *FCMService) sandboxPrefix() string {
	if s.isSandbox() {
		return "[SANDBOX] "
	}
	return ""
}

// SendPaymentToMerchant publishes a payment-received push to the merchant topic
// with the value and, when the payer is a Banzami wallet, their @banza handle.
// For external (acquiring) payers, payerHandle is empty and the body shows the
// value only. Carries a data payload so the app can render value + payer exactly.
func (s *FCMService) SendPaymentToMerchant(ctx context.Context, merchantID, payerHandle string, amountMinor int64, currency string) {
	if s == nil {
		return
	}
	topic, ok := s.topicForMerchant(merchantID)
	if !ok {
		return
	}
	prefix := s.sandboxPrefix()
	// The Banzami money format ("2 000 Kz"), as on every other surface.
	body := "Recebeu " + documents.FormatAmount(amountMinor, currency)
	if h := strings.TrimPrefix(strings.TrimSpace(payerHandle), "@"); h != "" {
		body += " de @" + h
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
	// The id masked; the topic, the payer's handle and the amount are not
	// logged (A6-14).
	if err != nil {
		slog.Error("[FCM] merchant payment notification failed", "merchant_id", obs.MaskID(merchantID), "error", err)
	} else {
		slog.Info("[FCM] merchant payment notification sent", "merchant_id", obs.MaskID(merchantID), "has_handle", payerHandle != "")
	}
}
