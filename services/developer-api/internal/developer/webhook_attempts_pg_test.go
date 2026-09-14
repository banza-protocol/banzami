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

// A delivery that succeeded is not replayed — unless its event is a Sandbox
// test event (synthetic), which moves nothing and exists to be sent again.
func TestPgStore_ReplayOfASucceededDeliveryOnlyForSyntheticEvents(t *testing.T) {
	ctx := context.Background()
	pool := devPoolOrSkip(ctx, t)
	defer pool.Close()
	var hasSynthetic bool
	_ = pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='webhook_events' AND column_name='synthetic')`).Scan(&hasSynthetic)
	if !hasSynthetic {
		t.Skip("migration 0142 not applied")
	}
	merchant, ep := uuid.NewString(), uuid.NewString()
	real, test := uuid.NewString(), uuid.NewString()
	dReal, dTest := uuid.NewString(), uuid.NewString()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_deliveries WHERE id = ANY($1)`, []string{dReal, dTest})
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_events WHERE id = ANY($1)`, []string{real, test})
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_endpoints WHERE id = $1`, ep)
	})
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO webhook_endpoints (id, merchant_id, url, events, active, secret, environment)
		  VALUES ($1, $2, 'https://example.test/hook', ARRAY['payment_session.paid'], true, 'sec', 'SANDBOX')`, []any{ep, merchant}},
		{`INSERT INTO webhook_events (id, merchant_id, event_type, payload, idempotency_key, synthetic)
		  VALUES ($1, $2, 'payment_session.paid', '{}'::jsonb, $3, false), ($4, $2, 'webhook.test', '{}'::jsonb, $5, true)`,
			[]any{real, merchant, "r:" + real, test, "t:" + test}},
		{`INSERT INTO webhook_deliveries (id, event_id, endpoint_id, status, attempt_count, status_code, delivered_at)
		  VALUES ($1, $2, $3, 'SUCCESS', 1, 200, now()), ($4, $5, $3, 'SUCCESS', 1, 200, now())`,
			[]any{dReal, real, ep, dTest, test}},
	} {
		if _, err := pool.Exec(ctx, q.sql, q.args...); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	store := NewPGStore(pool, env.Sandbox)
	if err := store.ReplayWebhookDelivery(ctx, merchant, dReal); err != ErrConflict {
		t.Fatalf("a succeeded real delivery must not be replayed: %v", err)
	}
	if err := store.ReplayWebhookDelivery(ctx, merchant, dTest); err != nil {
		t.Fatalf("a succeeded test delivery replays: %v", err)
	}
	if err := store.ReplayWebhookDelivery(ctx, uuid.NewString(), dTest); err != ErrNotFound {
		t.Fatalf("another merchant: %v", err)
	}
	evs, _ := store.WebhookEventsForMerchant(ctx, merchant, 10)
	synthetic := map[string]bool{}
	for _, e := range evs {
		synthetic[e.ID] = e.Synthetic
	}
	if synthetic[real] || !synthetic[test] {
		t.Fatalf("synthetic flags: %v", synthetic)
	}
}
