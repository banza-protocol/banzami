package service

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Replay exists to re-queue a delivery that failed for good. It also re-queued
// one that had already SUCCEEDED, so an integrator could be sent an event
// it had already received and acted on — a second "payment received" for one
// payment. DB-backed; skipped when DATABASE_URL is unset.
func TestReplayDelivery_ADeliveredEventIsNotSentAgain(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed replay test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	svc := &PostgresWebhookService{pool: pool}

	merchant := uuid.NewString()
	endpoint := uuid.NewString()
	eventID := uuid.NewString()
	delivered := uuid.NewString()
	failed := uuid.NewString()
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_deliveries WHERE event_id = $1`, eventID)
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_events WHERE id = $1`, eventID)
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_endpoints WHERE id = $1`, endpoint)
	}()

	if _, err := pool.Exec(ctx,
		`INSERT INTO webhook_endpoints (id, merchant_id, url, events, active, secret, environment)
		 VALUES ($1, $2, 'https://example.test/hook', ARRAY['refund.completed'], true, 'sec', 'SANDBOX')`,
		endpoint, merchant); err != nil {
		t.Fatalf("seed endpoint: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO webhook_events (id, merchant_id, event_type, payload, idempotency_key)
		 VALUES ($1, $2, 'refund.completed', '{"data":{}}'::jsonb, $3)`,
		eventID, merchant, "refund.completed:"+uuid.NewString()); err != nil {
		t.Fatalf("seed event: %v", err)
	}
	// One delivered and one failed delivery of the same event, on endpoints of
	// this merchant (the second needs its own endpoint row for the unique key).
	endpoint2 := uuid.NewString()
	defer func() { _, _ = pool.Exec(ctx, `DELETE FROM webhook_endpoints WHERE id = $1`, endpoint2) }()
	if _, err := pool.Exec(ctx,
		`INSERT INTO webhook_endpoints (id, merchant_id, url, events, active, secret, environment)
		 VALUES ($1, $2, 'https://example.test/hook2', ARRAY['refund.completed'], true, 'sec', 'SANDBOX')`,
		endpoint2, merchant); err != nil {
		t.Fatalf("seed endpoint2: %v", err)
	}
	for _, d := range []struct{ id, ep, status string }{{delivered, endpoint, "SUCCESS"}, {failed, endpoint2, "FAILED"}} {
		if _, err := pool.Exec(ctx,
			`INSERT INTO webhook_deliveries (id, event_id, endpoint_id, status, attempt_count, scheduled_at)
			 VALUES ($1, $2, $3, $4, 3, now())`,
			d.id, eventID, d.ep, d.status); err != nil {
			t.Fatalf("seed delivery %s: %v", d.status, err)
		}
	}

	if _, err := svc.ReplayDelivery(ctx, merchant, delivered); !errors.Is(err, ErrDeliveryAlreadyDelivered) {
		t.Fatalf("replaying a delivered event was answered %v", err)
	}
	var status string
	_ = pool.QueryRow(ctx, `SELECT status FROM webhook_deliveries WHERE id = $1`, delivered).Scan(&status)
	if status != "SUCCESS" {
		t.Fatalf("a delivered event was re-queued: status now %s", status)
	}

	// A failed delivery is exactly what replay is for.
	if _, err := svc.ReplayDelivery(ctx, merchant, failed); err != nil {
		t.Fatalf("a failed delivery could not be replayed: %v", err)
	}
	_ = pool.QueryRow(ctx, `SELECT status FROM webhook_deliveries WHERE id = $1`, failed).Scan(&status)
	if status != "PENDING" {
		t.Fatalf("a failed delivery was not re-queued: status %s", status)
	}
}
