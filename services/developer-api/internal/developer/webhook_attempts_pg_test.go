package developer

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/banzami/banzami/services/common/env"
)

// The Console's Webhook events page reads a delivery's attempts from here: each
// one with what the receiver answered. And only for the event's own merchant —
// naming another tenant's event id returns nothing, attempts included.
func TestPgStore_WebhookDeliveryAttempts(t *testing.T) {
	ctx := context.Background()
	pool := devPoolOrSkip(ctx, t)
	defer pool.Close()
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.webhook_delivery_attempts')::text`).Scan(&reg)
	if reg == nil {
		t.Skip("webhook_delivery_attempts not migrated — skipping")
	}

	merchant, ep, event, delivery := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_deliveries WHERE id = $1`, delivery)
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_events WHERE id = $1`, event)
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_endpoints WHERE id = $1`, ep)
	})
	t0 := time.Now().UTC().Add(-time.Minute)
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO webhook_endpoints (id, merchant_id, url, events, active, secret, environment)
		  VALUES ($1, $2, 'https://example.test/hook', ARRAY['payment.succeeded'], true, 'sec', 'SANDBOX')`, []any{ep, merchant}},
		{`INSERT INTO webhook_events (id, merchant_id, event_type, payload, idempotency_key)
		  VALUES ($1, $2, 'payment.succeeded', '{}'::jsonb, $3)`, []any{event, merchant, "t:" + event}},
		{`INSERT INTO webhook_deliveries (id, event_id, endpoint_id, status, attempt_count, status_code, delivered_at)
		  VALUES ($1, $2, $3, 'SUCCESS', 2, 200, now())`, []any{delivery, event, ep}},
		{`INSERT INTO webhook_delivery_attempts (delivery_id, attempt_number, outcome, status_code, error_class, attempted_at)
		  VALUES ($1, 1, 'FAILED', NULL, 'timeout', $2), ($1, 2, 'SUCCESS', 200, NULL, $3)`,
			[]any{delivery, t0, t0.Add(time.Minute)}},
	} {
		if _, err := pool.Exec(ctx, q.sql, q.args...); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	store := NewPGStore(pool, env.Sandbox)
	ds, err := store.WebhookDeliveriesForEvent(ctx, merchant, event)
	if err != nil {
		t.Fatal(err)
	}
	if len(ds) != 1 || len(ds[0].Attempts) != 2 {
		t.Fatalf("deliveries=%d attempts=%v", len(ds), ds)
	}
	a1, a2 := ds[0].Attempts[0], ds[0].Attempts[1]
	if a1.AttemptNumber != 1 || a1.Outcome != "FAILED" || a1.StatusCode != nil || a1.ErrorClass == nil || *a1.ErrorClass != "timeout" {
		t.Fatalf("first attempt = %+v", a1)
	}
	if a2.AttemptNumber != 2 || a2.Outcome != "SUCCESS" || a2.StatusCode == nil || *a2.StatusCode != 200 {
		t.Fatalf("second attempt = %+v", a2)
	}

	other, err := store.WebhookDeliveriesForEvent(ctx, uuid.NewString(), event)
	if err != nil {
		t.Fatal(err)
	}
	if len(other) != 0 {
		t.Fatalf("another merchant naming this event id saw %d deliveries", len(other))
	}
}
