package service

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Retention is a promise the Console makes to the developer ("kept for 30
// days"), and a promise about a table that would otherwise grow forever. A
// pruner that silently deletes nothing keeps neither, and looks identical to one
// that works until the disk fills. DB-backed; skipped when DATABASE_URL is unset.
func TestRequestLogPrune_DeletesPastRetentionAndKeepsTheRest(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed retention test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	// A log row references a real project (FK), so borrow any existing one.
	var projectID string
	if err := pool.QueryRow(ctx, `SELECT id FROM developer.dev_projects LIMIT 1`).Scan(&projectID); err != nil {
		t.Skipf("no developer project available: %v", err)
	}

	marker := "retention-test-" + uuid.NewString()
	insert := func(age time.Duration) {
		if _, err := pool.Exec(ctx,
			`INSERT INTO developer.dev_api_request_logs
			   (project_id, environment, method, path, route, status, request_id, latency_ms, created_at)
			 VALUES ($1,'SANDBOX','GET',$2,$2,200,$3,1, now() - $4::interval)`,
			projectID, "/"+marker, marker, age.String()); err != nil {
			t.Fatalf("insert (age %s): %v", age, err)
		}
	}
	count := func() int {
		var n int
		if err := pool.QueryRow(ctx,
			`SELECT count(*) FROM developer.dev_api_request_logs WHERE request_id = $1`, marker).Scan(&n); err != nil {
			t.Fatalf("count: %v", err)
		}
		return n
	}
	defer pool.Exec(ctx, `DELETE FROM developer.dev_api_request_logs WHERE request_id = $1`, marker)

	insert(RequestLogRetention + 48*time.Hour) // well past the window
	insert(RequestLogRetention + time.Hour)    // just past it
	insert(RequestLogRetention - time.Hour)    // just inside it
	insert(time.Minute)                        // fresh

	if got := count(); got != 4 {
		t.Fatalf("fixture rows = %d, want 4 — the assertions below would be vacuous", got)
	}

	rec := NewPostgresRequestLogRecorder(pool)
	rec.Prune(ctx)

	// Two aged rows gone, two live rows kept. Deleting all four would also make
	// "the old ones are gone" true, which is why both halves are asserted.
	if got := count(); got != 2 {
		t.Errorf("after prune rows = %d, want 2 (the two inside the window)", got)
	}
	var oldest time.Duration
	if err := pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(now() - created_at), '0'::interval)
		   FROM developer.dev_api_request_logs WHERE request_id = $1`, marker).Scan(&oldest); err != nil {
		t.Fatalf("age query: %v", err)
	}
	if oldest >= RequestLogRetention {
		t.Errorf("a row older than the retention window survived: age %s", oldest)
	}
}

// Audit records are governed separately and are DB-immutable (migration 0099).
// The pruner must not name that table at all.
func TestRequestLogPrune_NeverTouchesAuditEvents(t *testing.T) {
	src, err := os.ReadFile("postgres_request_logs.go")
	if err != nil {
		t.Fatal(err)
	}
	// Comments are excluded: the file names audit_events in order to say the
	// pruner leaves it alone, which is the opposite of touching it.
	var code strings.Builder
	for _, line := range strings.Split(string(src), "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "//") {
			continue
		}
		code.WriteString(line)
		code.WriteByte('\n')
	}
	for _, forbidden := range []string{"audit_events", "audit_log"} {
		if strings.Contains(code.String(), forbidden) {
			t.Errorf("the request-log pruner references %s in code — audit retention is a separate policy", forbidden)
		}
	}
}
