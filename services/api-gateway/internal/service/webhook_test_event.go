package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// The synthetic webhook test event (ADR-060 §8).
//
// It exists so a developer can check, on demand, that an endpoint is reachable,
// verifies banza-signature and parses an envelope — without a payment. It is
// deliberately unmistakable for a financial event:
//
//   - type "webhook.test", not one of the seven financial events, and not
//     subscribable (SupportedWebhookEvents does not list it);
//   - recorded with webhook_events.synthetic = true;
//   - delivered to the ONE endpoint it was sent to, whatever that endpoint
//     subscribes to;
//   - its data says it is synthetic and moved no money, and nothing in the
//     ledger, a session or a balance is touched.
//
// It is signed and delivered by the same dispatcher as every other event, so a
// passing test proves the same path a real event takes.

// WebhookTestEventType is the synthetic event's type.
const WebhookTestEventType = "webhook.test"

// ErrEndpointInactive: a disabled endpoint receives nothing, test events included.
var ErrEndpointInactive = errors.New("webhook endpoint is disabled")

// WebhookTestSender is implemented by services that can send a test event.
type WebhookTestSender interface {
	SendTestEvent(ctx context.Context, merchantID, endpointID string) (*WebhookEvent, string, error)
}

// SendTestEvent records a synthetic event and a pending delivery to one endpoint.
func (s *PostgresWebhookService) SendTestEvent(ctx context.Context, merchantID, endpointID string) (*WebhookEvent, string, error) {
	var active bool
	err := s.pool.QueryRow(ctx,
		`SELECT active FROM webhook_endpoints WHERE id = $1 AND merchant_id = $2`,
		endpointID, merchantID).Scan(&active)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", ErrEndpointNotFound
	}
	if err != nil {
		return nil, "", fmt.Errorf("read endpoint: %w", err)
	}
	if !active {
		return nil, "", ErrEndpointInactive
	}
	eventID := uuid.NewString()
	deliveryID := uuid.NewString()
	now := time.Now().UTC()
	envelope, err := json.Marshal(map[string]any{
		"id":         eventID,
		"type":       WebhookTestEventType,
		"created_at": now,
		"synthetic":  true,
		"data": map[string]any{
			"endpoint_id": endpointID,
			"message":     "Synthetic test delivery from the Banzami Sandbox. No payment exists and no money moved.",
		},
	})
	if err != nil {
		return nil, "", err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx,
		`INSERT INTO webhook_events (id, merchant_id, event_type, payload, created_at, dispatched_at, synthetic)
		 VALUES ($1, $2, $3, $4, $5, $5, true)`,
		eventID, merchantID, WebhookTestEventType, envelope, now); err != nil {
		return nil, "", fmt.Errorf("insert test event: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO webhook_deliveries (id, event_id, endpoint_id, status, scheduled_at, created_at)
		 VALUES ($1, $2, $3, 'PENDING', now(), now())`,
		deliveryID, eventID, endpointID); err != nil {
		return nil, "", fmt.Errorf("insert test delivery: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, "", err
	}
	return &WebhookEvent{ID: eventID, MerchantID: merchantID, EventType: WebhookTestEventType,
		Payload: json.RawMessage(envelope), CreatedAt: now, Synthetic: true}, deliveryID, nil
}
