package service

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func notifPoolOrSkip(ctx context.Context, t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed notification test")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.admin_notifications')::text`).Scan(&reg)
	if reg == nil {
		pool.Close()
		t.Skip("admin_notifications not migrated — skipping")
	}
	return pool
}

// Generation is idempotent (re-running adds nothing), it derives a notification
// from a real KYB event, and the list/unread/mark-read/dismiss lifecycle works.
func TestNotifications_GenerateListLifecycle(t *testing.T) {
	ctx := context.Background()
	pool := notifPoolOrSkip(ctx, t)
	defer pool.Close()

	// Seed a merchant + a real KYB "uploaded" event for it (the generation source).
	m := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO merchants (id, name, email, status) VALUES ($1,'Notif Loja',$2,'ACTIVE')`, m, m+"@test"); err != nil {
		t.Fatalf("seed merchant: %v", err)
	}
	evID := uuid.NewString()
	if _, err := pool.Exec(ctx,
		`INSERT INTO merchant_kyb_events (id, merchant_id, event_type, payload, idempotency_key, created_at)
		 VALUES ($1,$2,'merchant.kyb.document.uploaded','{}'::jsonb,$3, now())`,
		evID, m, "notif-test-"+evID); err != nil {
		t.Fatalf("seed kyb event: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM admin_notifications WHERE source_key = $1`, "kyb:"+evID)
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_kyb_events WHERE id = $1`, evID)
		_, _ = pool.Exec(ctx, `DELETE FROM merchants WHERE id = $1`, m)
	})

	svc := NewNotificationService(pool, "LIVE")

	// Generate twice → idempotent (exactly one notification for the event).
	if err := svc.Generate(ctx); err != nil {
		t.Fatalf("generate: %v", err)
	}
	if err := svc.Generate(ctx); err != nil {
		t.Fatalf("generate2: %v", err)
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM admin_notifications WHERE source_key=$1`, "kyb:"+evID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("generation not idempotent: got %d rows for the event", n)
	}

	// The generated notification appears in the list, unread.
	items, err := svc.List(ctx, "UNREAD", 100)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	var got *AdminNotification
	for i := range items {
		if items[i].EntityID == m && items[i].Type == "KYB_DOC_SUBMITTED" {
			got = &items[i]
		}
	}
	if got == nil {
		t.Fatalf("generated KYB notification not in unread list")
	}
	if got.Href != "/merchant-kyb" || got.Status != "UNREAD" || got.Environment != "LIVE" {
		t.Fatalf("notification fields wrong: %+v", got)
	}

	before, _ := svc.UnreadCount(ctx)

	// Mark read → drops out of UNREAD and the unread count decreases.
	if err := svc.MarkRead(ctx, got.ID); err != nil {
		t.Fatalf("mark read: %v", err)
	}
	after, _ := svc.UnreadCount(ctx)
	if after != before-1 {
		t.Fatalf("unread count after read: got %d want %d", after, before-1)
	}

	// Dismiss → removed from the feed entirely.
	if err := svc.Dismiss(ctx, got.ID); err != nil {
		t.Fatalf("dismiss: %v", err)
	}
	all, _ := svc.List(ctx, "", 100)
	for _, it := range all {
		if it.ID == got.ID {
			t.Fatalf("dismissed notification still in feed")
		}
	}
}

// A SANDBOX-scoped service never sees LIVE rows and vice-versa.
func TestNotifications_EnvironmentIsolation(t *testing.T) {
	ctx := context.Background()
	pool := notifPoolOrSkip(ctx, t)
	defer pool.Close()

	id := uuid.NewString()
	sk := "test-iso:" + id
	if _, err := pool.Exec(ctx,
		`INSERT INTO admin_notifications (id, environment, type, severity, title, source_key)
		 VALUES ($1,'SANDBOX','TEST','info','Sandbox only',$2)`, id, sk); err != nil {
		t.Fatalf("seed: %v", err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM admin_notifications WHERE source_key=$1`, sk) })

	live := NewNotificationService(pool, "LIVE")
	sandbox := NewNotificationService(pool, "SANDBOX")

	liveItems, _ := live.List(ctx, "", 100)
	for _, it := range liveItems {
		if it.ID == id {
			t.Fatalf("LIVE service leaked a SANDBOX notification")
		}
	}
	sbItems, _ := sandbox.List(ctx, "", 100)
	found := false
	for _, it := range sbItems {
		if it.ID == id {
			found = true
		}
	}
	if !found {
		t.Fatalf("SANDBOX service did not return its own notification")
	}
}
