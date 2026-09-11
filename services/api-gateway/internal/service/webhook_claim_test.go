package service

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// A due delivery is claimed by one tick, not re-selected by the next while its
// attempt is in flight (the SKIP LOCKED lock died with its autocommit query, so
// a slow endpoint received the same event up to six times).
func TestClaimDueDeliveries_OneTickOneClaim(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed claim test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	svc := &PostgresWebhookService{pool: pool}
	merchant, ep, ev, del := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_deliveries WHERE id = $1`, del)
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_events WHERE id = $1`, ev)
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_endpoints WHERE id = $1`, ep)
	}()
	must := func(q string, args ...any) {
		if _, err := pool.Exec(ctx, q, args...); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	must(`INSERT INTO webhook_endpoints (id, merchant_id, url, events, active, secret, environment)
	      VALUES ($1, $2, 'https://example.test/hook', ARRAY['refund.completed'], true, 'sec', 'SANDBOX')`, ep, merchant)
	must(`INSERT INTO webhook_events (id, merchant_id, event_type, payload, idempotency_key)
	      VALUES ($1, $2, 'refund.completed', '{"data":{}}'::jsonb, $3)`, ev, merchant, "claim:"+ev)
	must(`INSERT INTO webhook_deliveries (id, event_id, endpoint_id, status, attempt_count, max_attempts, scheduled_at)
	      VALUES ($1, $2, $3, 'PENDING', 0, 5, now() - interval '1 second')`, del, ev, ep)

	mine := func(ds []pendingDelivery) int {
		n := 0
		for _, d := range ds {
			if d.id == del {
				n++
			}
		}
		return n
	}
	if n := mine(svc.claimDueDeliveries(ctx)); n != 1 {
		t.Fatalf("first tick claimed %d, want 1", n)
	}
	if n := mine(svc.claimDueDeliveries(ctx)); n != 0 {
		t.Fatal("the next tick re-selected a delivery whose attempt is still in flight")
	}
}
