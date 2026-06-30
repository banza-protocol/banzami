package handler

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// Audit Part 7 / Unit 3: the internal reverse endpoint must flip a transaction's
// public proof to REVERSED (the proactive hook refunds + dispute-resolution use).
func TestProofHandler_Reverse(t *testing.T) {
	ctx := context.Background()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed reverse test")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.transaction_proofs')::text`).Scan(&reg)
	if reg == nil {
		t.Skip("transaction_proofs not migrated — skipping")
	}

	svc := service.NewProofService(pool, "test-key", "op-hmac-v1", "banzami", "banza", "https://banzami.com/r/")
	txn := uuid.NewString()
	confirmed := time.Now().UTC().Truncate(time.Second)
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id=$1`, txn) })

	p, err := svc.Ensure(ctx, service.ProofInput{
		TransactionID: txn, Environment: "SANDBOX", AmountMinor: 1000, Currency: "AOA",
		Status: "COMPLETED", PayerHandle: "a", PayeeHandle: "b", LedgerReference: txn, ConfirmedAt: &confirmed,
	})
	if err != nil {
		t.Fatalf("ensure: %v", err)
	}
	if p.Status != "CONFIRMED" {
		t.Fatalf("precondition: want CONFIRMED, got %s", p.Status)
	}

	h := NewProofHandler(svc, "salt")
	body := `{"transaction_id":"` + txn + `","environment":"SANDBOX"}`
	rec := httptest.NewRecorder()
	h.Reverse(rec, httptest.NewRequest("POST", "/internal/v1/proofs/reverse", strings.NewReader(body)))

	if rec.Code != 200 {
		t.Fatalf("reverse: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out["reversed"] != true {
		t.Fatalf("response: want reversed=true, got %v", out)
	}

	after, err := svc.GetByReference(ctx, p.ProofReference)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if after.Status != "REVERSED" || after.ReversedAt == nil {
		t.Fatalf("proof not reversed: status=%s reversed_at=%v", after.Status, after.ReversedAt)
	}
}
