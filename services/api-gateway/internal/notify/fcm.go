package notify

import (
	"context"
	"fmt"
	"log/slog"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

// FCMService wraps the Firebase Cloud Messaging client.
// A nil receiver is safe to call — all methods become no-ops when FCM is
// disabled (FIREBASE_CREDENTIALS_JSON not set).
type FCMService struct {
	client *messaging.Client
}

// NewFCMService initialises the FCM client from a JSON service-account string.
// Returns nil (disabled, no error) when credentialsJSON is empty so the
// gateway starts cleanly in local-dev environments without Firebase.
func NewFCMService(ctx context.Context, credentialsJSON string) (*FCMService, error) {
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
	return &FCMService{client: client}, nil
}

// SendToMerchant publishes a push notification to the FCM topic
// "merchant_<merchantID>", which all devices signed in as that merchant
// subscribe to on app launch.
//
// Errors are logged but never propagated — push notifications are best-effort
// and must never affect the payment processing flow.
func (s *FCMService) SendToMerchant(ctx context.Context, merchantID, title, body string) {
	if s == nil {
		return
	}
	_, err := s.client.Send(ctx, &messaging.Message{
		Notification: &messaging.Notification{
			Title: title,
			Body:  body,
		},
		Android: &messaging.AndroidConfig{
			Priority: "high",
		},
		APNS: &messaging.APNSConfig{
			Payload: &messaging.APNSPayload{
				Aps: &messaging.Aps{Sound: "default"},
			},
		},
		Topic: "merchant_" + merchantID,
	})
	if err != nil {
		slog.Error("fcm: merchant notification failed",
			"merchant_id", merchantID,
			"error", err,
		)
	}
}
