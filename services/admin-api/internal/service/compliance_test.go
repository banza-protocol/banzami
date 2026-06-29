package service

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func compliancePoolOrSkip(ctx context.Context, t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed compliance test")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.compliance_cases')::text`).Scan(&reg)
	if reg == nil {
		pool.Close()
		t.Skip("compliance_cases not migrated — skipping")
	}
	return pool
}

// Sync materializes a KYB case from a pending document, is idempotent, supports
// the assignment + notes lifecycle, and auto-resolves when the source clears.
func TestCompliance_SyncAssignNotesResolve(t *testing.T) {
	ctx := context.Background()
	pool := compliancePoolOrSkip(ctx, t)
	defer pool.Close()
	svc := NewComplianceService(pool, "SANDBOX")

	m := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO merchants (id, name, email, status) VALUES ($1,'Case Loja',$2,'ACTIVE')`, m, m+"@test"); err != nil {
		t.Fatalf("seed merchant: %v", err)
	}
	doc := uuid.NewString()
	if _, err := pool.Exec(ctx,
		`INSERT INTO merchant_kyb_documents (id, merchant_id, document_type, status, storage_bucket, storage_key, mime_type, environment, submitted_at)
		 VALUES ($1,$2,'COMPANY_TAX_ID','PENDING_REVIEW','b',$3,'image/jpeg','SANDBOX',NOW())`, doc, m, "k/"+doc); err != nil {
		t.Fatalf("seed doc: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM compliance_cases WHERE source_key=$1`, "kyb:"+m)
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_kyb_documents WHERE merchant_id=$1`, m)
		_, _ = pool.Exec(ctx, `DELETE FROM merchants WHERE id=$1`, m)
	})

	// Sync twice → one case (idempotent), type KYB_MERCHANT, enriched name, UNASSIGNED.
	if err := svc.Sync(ctx); err != nil {
		t.Fatalf("sync: %v", err)
	}
	if err := svc.Sync(ctx); err != nil {
		t.Fatalf("sync2: %v", err)
	}
	cases, total, err := svc.List(ctx, CaseFilters{CaseType: "KYB_MERCHANT", Search: m})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 1 || len(cases) != 1 {
		t.Fatalf("expected exactly one KYB case, got total=%d len=%d", total, len(cases))
	}
	c := cases[0]
	if c.EntityName != "Case Loja" || c.Status != "UNASSIGNED" || c.EntityID != m || c.Environment != "SANDBOX" {
		t.Fatalf("case not synced correctly: %+v", c)
	}

	// Assign by name (empty id → NULL FK) → status ASSIGNED + owner name set.
	if err := svc.Assign(ctx, c.ID, "", "Op Um"); err != nil {
		t.Fatalf("assign: %v", err)
	}
	got, _ := svc.Get(ctx, c.ID)
	if got.Status != "ASSIGNED" || got.AssignedName != "Op Um" {
		t.Fatalf("after assign: %+v", got)
	}

	// Note lifecycle (author by name; no FK row needed).
	if _, err := svc.AddNote(ctx, c.ID, "", "Op Um", "verificar o BI do representante"); err != nil {
		t.Fatalf("add note: %v", err)
	}
	notes, err := svc.ListNotes(ctx, c.ID)
	if err != nil || len(notes) != 1 || notes[0].Body != "verificar o BI do representante" {
		t.Fatalf("notes: %v / %+v", err, notes)
	}

	// Escalate raises status + priority.
	if err := svc.Escalate(ctx, c.ID); err != nil {
		t.Fatalf("escalate: %v", err)
	}
	got, _ = svc.Get(ctx, c.ID)
	if got.Status != "ESCALATED" || got.Priority != "HIGH" {
		t.Fatalf("after escalate: %+v", got)
	}

	// Remove the pending document → next sync auto-resolves the case.
	if _, err := pool.Exec(ctx, `UPDATE merchant_kyb_documents SET status='VALID' WHERE id=$1`, doc); err != nil {
		t.Fatalf("clear doc: %v", err)
	}
	if err := svc.Sync(ctx); err != nil {
		t.Fatalf("sync3: %v", err)
	}
	got, _ = svc.Get(ctx, c.ID)
	if got.Status != "RESOLVED" || got.ResolvedAt == nil {
		t.Fatalf("expected auto-resolved, got %+v", got)
	}

	// Unknown id → not found.
	if _, err := svc.Get(ctx, uuid.NewString()); !errors.Is(err, ErrComplianceCaseNotFound) {
		t.Fatalf("unknown id: want ErrComplianceCaseNotFound, got %v", err)
	}
}
