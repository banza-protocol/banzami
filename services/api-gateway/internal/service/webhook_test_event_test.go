package service

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// A test event is synthetic, goes to one endpoint, touches nothing financial,
// and — unlike a real event — may be replayed after it succeeded.
func TestSendTestEvent_SyntheticSingleEndpointReplayable(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed test event test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	svc := &PostgresWebhookService{pool: pool}

	merchant, other := uuid.NewString(), uuid.NewString()
	ep, ep2, epOff := uuid.NewString(), uuid.NewString(), uuid.NewString()
	for _, e := range []struct {
		id, m  string
		active bool
	}{{ep, merchant, true}, {ep2, merchant, true}, {epOff, merchant, false}} {
		if _, err := pool.Exec(ctx,
			`INSERT INTO webhook_endpoints (id, merchant_id, url, events, active, secret, environment)
			 VALUES ($1::uuid, $2, 'https://example.test/'||$1::text, ARRAY['payment_session.paid'], $3, 'sec', 'SANDBOX')`,
			e.id, e.m, e.active); err != nil {
			t.Fatalf("seed endpoint: %v", err)
		}
	}
	var ledgerBefore int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM ledger_entries`).Scan(&ledgerBefore)

	ev, deliveryID, err := svc.SendTestEvent(ctx, merchant, ep)
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_deliveries WHERE event_id = $1`, ev.ID)
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_events WHERE id = $1`, ev.ID)
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_endpoints WHERE id = ANY($1)`, []string{ep, ep2, epOff})
	}()
	var env map[string]any
	_ = json.Unmarshal(ev.Payload, &env)
	if env["type"] != WebhookTestEventType || env["synthetic"] != true {
		t.Fatalf("envelope: %v", env)
	}
	var synthetic bool
	var deliveries int
	_ = pool.QueryRow(ctx, `SELECT synthetic FROM webhook_events WHERE id = $1`, ev.ID).Scan(&synthetic)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM webhook_deliveries WHERE event_id = $1`, ev.ID).Scan(&deliveries)
	if !synthetic || deliveries != 1 {
		t.Fatalf("synthetic=%v deliveries=%d — want one delivery to the named endpoint", synthetic, deliveries)
	}
	var ledgerAfter int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM ledger_entries`).Scan(&ledgerAfter)
	if ledgerAfter != ledgerBefore {
		t.Fatal("a test event wrote ledger entries")
	}
	if _, _, err := svc.SendTestEvent(ctx, other, ep); !errors.Is(err, ErrEndpointNotFound) {
		t.Fatalf("another merchant's test event on this endpoint: %v", err)
	}
	if _, _, err := svc.SendTestEvent(ctx, merchant, epOff); !errors.Is(err, ErrEndpointInactive) {
		t.Fatalf("a disabled endpoint: %v", err)
	}
	// Mark it delivered; a synthetic delivery may be replayed.
	_, _ = pool.Exec(ctx, `UPDATE webhook_deliveries SET status = 'SUCCESS' WHERE id = $1`, deliveryID)
	if _, err := svc.ReplayDelivery(ctx, merchant, deliveryID); err != nil {
		t.Fatalf("replaying a delivered test event: %v", err)
	}

	// Synthetic deliveries to one endpoint are bounded: sends and replays count
	// together, another endpoint has its own allowance.
	var sent []string
	defer func() {
		for _, id := range sent {
			_, _ = pool.Exec(ctx, `DELETE FROM webhook_deliveries WHERE event_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM webhook_events WHERE id = $1`, id)
		}
	}()
	for i := 2; i < WebhookTestEventsPerMinute; i++ { // the send and the replay above were 1 row, rescheduled
		e, _, err := svc.SendTestEvent(ctx, merchant, ep)
		if err != nil {
			t.Fatalf("test event %d refused below the limit: %v", i, err)
		}
		sent = append(sent, e.ID)
	}
	tenth, _, err := svc.SendTestEvent(ctx, merchant, ep)
	if err != nil {
		t.Fatalf("the tenth: %v", err)
	}
	sent = append(sent, tenth.ID)
	if _, _, err := svc.SendTestEvent(ctx, merchant, ep); !errors.Is(err, ErrTestEventRateLimited) {
		t.Fatalf("over the limit: %v", err)
	}
	_, _ = pool.Exec(ctx, `UPDATE webhook_deliveries SET status = 'SUCCESS' WHERE id = $1`, deliveryID)
	if _, err := svc.ReplayDelivery(ctx, merchant, deliveryID); !errors.Is(err, ErrTestEventRateLimited) {
		t.Fatalf("a replay over the limit: %v", err)
	}
	elsewhere, _, err := svc.SendTestEvent(ctx, merchant, ep2)
	if err != nil {
		t.Fatalf("another endpoint: %v", err)
	}
	sent = append(sent, elsewhere.ID)
}
