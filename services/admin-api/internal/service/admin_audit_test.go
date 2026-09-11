package service

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// A5-03. The audit row is written after the action commits. A client that
// disconnects cancels the request's context, and the insert used to fail with
// it — the action stood, and the record of who took it did not.
func TestAuditWrite_SurvivesTheClientGoingAway(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed audit test")
	}
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	entity := uuid.NewString()
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // the client has already gone

	NewAuditService(pool).Write(ctx, AuditEntry{
		Action: "APPROVE_APPLICATION", EntityType: "merchant_application", EntityID: entity, StatusCode: 200,
	})

	var n int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM admin_audit_log WHERE entity_id = $1`, entity).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("an action whose client disconnected left %d audit rows, want 1", n)
	}
}
