package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// A receiver that refuses twice and accepts on the third attempt. Afterwards
// the delivery must still be one delivery — SUCCESS, three attempts — and its
// history must say what the receiver answered each time. Before migration 0119
// the two refusals were overwritten by the success and the record read
// "SUCCESS 200, 3 attempts", with nothing about the 500s a developer needed to
// see. DB-backed; skipped when DATABASE_URL is unset.
func TestWebhookDelivery_EveryAttemptIsRecordedAsItHappened(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed webhook attempt test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.webhook_delivery_attempts')::text`).Scan(&reg)
	if reg == nil {
		t.Skip("webhook_delivery_attempts not migrated — skipping")
	}

	var calls atomic.Int32
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) <= 2 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer receiver.Close()

	merchant, ep, event, delivery := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_deliveries WHERE id = $1`, delivery)
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_events WHERE id = $1`, event)
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_endpoints WHERE id = $1`, ep)
	}()
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO webhook_endpoints (id, merchant_id, url, events, active, secret, environment)
		  VALUES ($1, $2, $3, ARRAY['payment.succeeded'], true, 'sec', 'SANDBOX')`, []any{ep, merchant, receiver.URL}},
		{`INSERT INTO webhook_events (id, merchant_id, event_type, payload, idempotency_key)
		  VALUES ($1, $2, 'payment.succeeded', '{"data":{}}'::jsonb, $3)`, []any{event, merchant, "t:" + event}},
		{`INSERT INTO webhook_deliveries (id, event_id, endpoint_id, status, scheduled_at)
		  VALUES ($1, $2, $3, 'PENDING', now())`, []any{delivery, event, ep}},
	} {
		if _, err := pool.Exec(ctx, q.sql, q.args...); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	// The test receiver is on loopback, which the production client refuses by
	// design (SSRF guard); this test is about what is recorded, not about that.
	svc := &PostgresWebhookService{pool: pool, client: receiver.Client()}
	for attempt := 0; attempt < 3; attempt++ {
		svc.attemptDelivery(ctx, pendingDelivery{
			id: delivery, eventID: event, endpointID: ep, attemptCount: attempt, maxAttempts: 5,
			payload: []byte(`{"data":{}}`), url: receiver.URL, secret: "sec",
		})
	}

	ds, err := svc.ListDeliveries(ctx, merchant, event)
	if err != nil {
		t.Fatal(err)
	}
	if len(ds) != 1 {
		t.Fatalf("%d deliveries — a retried event is still ONE delivery", len(ds))
	}
	d := ds[0]
	if d.Status != "SUCCESS" || d.AttemptNumber != 3 || d.StatusCode != 200 || d.DeliveredAt == nil {
		t.Fatalf("delivery = %s attempt %d status %d delivered %v", d.Status, d.AttemptNumber, d.StatusCode, d.DeliveredAt)
	}
	if len(d.Attempts) != 3 {
		t.Fatalf("%d attempts listed, want 3", len(d.Attempts))
	}
	for i, a := range d.Attempts {
		if a.AttemptNumber != i+1 {
			t.Fatalf("attempt %d numbered %d", i, a.AttemptNumber)
		}
	}
	for _, a := range d.Attempts[:2] {
		if a.Outcome != "FAILED" || a.StatusCode == nil || *a.StatusCode != 500 || a.ErrorClass == nil || *a.ErrorClass != "http_status" {
			t.Fatalf("refused attempt recorded as %+v", a)
		}
	}
	last := d.Attempts[2]
	if last.Outcome != "SUCCESS" || last.StatusCode == nil || *last.StatusCode != 200 || last.ErrorClass != nil {
		t.Fatalf("final attempt recorded as %+v", last)
	}
	if !d.Attempts[0].AttemptedAt.Before(d.Attempts[2].AttemptedAt) && !d.Attempts[0].AttemptedAt.Equal(d.Attempts[2].AttemptedAt) {
		t.Fatalf("attempts out of time order")
	}

	// History is append-only.
	if _, err := pool.Exec(ctx, `UPDATE webhook_delivery_attempts SET status_code = 200 WHERE delivery_id = $1`, delivery); err == nil {
		t.Fatal("an attempt was rewritten after the fact")
	}
}

// A receiver that never answers is a failed attempt with no HTTP status and a
// named reason — never a success, never a raw error string.
func TestClassifyAttempt(t *testing.T) {
	if o := classifyAttempt(204, nil); !o.succeeded {
		t.Fatal("204 is a delivered webhook")
	}
	if o := classifyAttempt(404, nil); o.succeeded || o.errorClass != "http_status" {
		t.Fatalf("404 → %+v", o)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := srv.URL
	srv.Close() // nothing listens there now
	_, err := http.Post(url, "application/json", nil)
	if o := classifyAttempt(0, err); o.succeeded || o.errorClass != "connection" {
		t.Fatalf("refused connection → %+v (%v)", o, err)
	}
}
