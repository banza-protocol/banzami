package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/api-gateway/internal/kybstorage"
)

func TestMerchantKybLifecycle_RealDB(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed merchant KYB test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.merchant_kyb_documents')::text`).Scan(&reg)
	if reg == nil {
		t.Skip("merchant_kyb_documents not migrated — skipping")
	}

	fake := kybstorage.NewFakeStorage("banzami-kyb-sandbox")
	svc := NewPostgresMerchantKybService(pool, fake, 5*1024*1024)

	mA := uuid.NewString()
	mB := uuid.NewString()
	// The stale-merchant guard requires the merchant to exist in `merchants`.
	_, _ = pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS merchants (id uuid PRIMARY KEY, name text, email text, status text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), verified boolean DEFAULT false)`)
	if _, err := pool.Exec(ctx, `INSERT INTO merchants (id, name, email, status) VALUES ($1,'A',$3,'ACTIVE'),($2,'B',$4,'ACTIVE') ON CONFLICT (id) DO NOTHING`, mA, mB, mA+"@test", mB+"@test"); err != nil {
		t.Fatalf("seed merchants: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_kyb_documents WHERE merchant_id = ANY($1)`, []string{mA, mB})
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_kyb_events WHERE merchant_id = ANY($1)`, []string{mA, mB})
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_compliance WHERE merchant_id = ANY($1)`, []string{mA, mB})
		_, _ = pool.Exec(ctx, `DELETE FROM merchants WHERE id = ANY($1)`, []string{mA, mB})
	})

	// Stale-merchant guard: a JWT for a merchant that no longer exists must NOT
	// create an orphan document.
	stale := uuid.NewString()
	if _, _, err := svc.RequestUploadURL(ctx, stale, "SANDBOX", "COMPANY_TAX_ID", "image/jpeg"); !errors.Is(err, ErrKybMerchantNotFound) {
		t.Fatalf("stale merchant upload-url: want ErrKybMerchantNotFound, got %v", err)
	}
	if _, err := svc.ListDocuments(ctx, stale); !errors.Is(err, ErrKybMerchantNotFound) {
		t.Fatalf("stale merchant list: want ErrKybMerchantNotFound, got %v", err)
	}
	var orphan int
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM merchant_kyb_documents WHERE merchant_id=$1`, stale).Scan(&orphan)
	if orphan != 0 {
		t.Fatalf("stale merchant created %d orphan documents", orphan)
	}

	// Fresh merchant → 3 MISSING slots.
	docs, err := svc.ListDocuments(ctx, mA)
	if err != nil || len(docs) != 3 {
		t.Fatalf("list: %d docs (err %v), want 3", len(docs), err)
	}
	for _, d := range docs {
		if d.Status != "MISSING" {
			t.Fatalf("fresh slot %s = %s, want MISSING", d.DocumentType, d.Status)
		}
	}

	ids := map[string]string{}
	upload := func(typ string) string {
		docID, up, err := svc.RequestUploadURL(ctx, mA, "SANDBOX", typ, "image/jpeg")
		if err != nil {
			t.Fatalf("upload-url %s: %v", typ, err)
		}
		if up.Method != "PUT" || up.URL == "" {
			t.Fatalf("upload-url %s: bad signed PUT", typ)
		}
		key := fmt.Sprintf("kyb/merchant/%s/%s/%s", mA, strings.ToLower(typ), docID)
		fake.PutObject(key, 2048, "image/jpeg")
		doc, err := svc.CompleteUpload(ctx, mA, docID, "")
		if err != nil || doc.Status != "PENDING_REVIEW" {
			t.Fatalf("complete %s: status=%v err=%v", typ, doc, err)
		}
		return docID
	}
	for _, typ := range KybDocumentTypes {
		ids[typ] = upload(typ)
	}

	// Reject requires a reason.
	if err := svc.AdminReject(ctx, ids["COMMERCIAL_REGISTRATION"], "admin-1", "", ""); !errors.Is(err, ErrKybReasonRequired) {
		t.Fatalf("reject w/o reason: %v", err)
	}
	if err := svc.AdminReject(ctx, ids["COMMERCIAL_REGISTRATION"], "admin-1", "DOC_UNREADABLE", ""); err != nil {
		t.Fatalf("reject: %v", err)
	}
	got, _ := svc.GetDocument(ctx, mA, ids["COMMERCIAL_REGISTRATION"])
	if got.Status != "REJECTED" || got.RejectionReason != "DOC_UNREADABLE" {
		t.Fatalf("after reject: %+v", got)
	}

	// Re-upload the rejected type, then approve all three.
	ids["COMMERCIAL_REGISTRATION"] = upload("COMMERCIAL_REGISTRATION")
	for _, typ := range KybDocumentTypes {
		if err := svc.AdminApprove(ctx, ids[typ], "admin-1", "", nil); err != nil {
			t.Fatalf("approve %s: %v", typ, err)
		}
	}

	// All required VALID → merchant KYB APPROVED.
	st, err := svc.GetStatus(ctx, mA)
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if st.KybStatus != "APPROVED" || !st.Verified {
		t.Fatalf("status after all approved = %s (verified %v), want APPROVED", st.KybStatus, st.Verified)
	}
	for _, d := range st.Documents {
		if d.Status != "VALID" {
			t.Fatalf("doc %s = %s, want VALID", d.DocumentType, d.Status)
		}
	}

	// The old rejected doc was superseded.
	var replaced int
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM merchant_kyb_documents WHERE merchant_id=$1 AND status='REPLACED'`, mA).Scan(&replaced)
	if replaced == 0 {
		t.Fatalf("expected the rejected doc to be REPLACED after re-approval")
	}

	// Ownership: another merchant cannot read this doc.
	if _, err := svc.GetDocument(ctx, mB, ids["COMPANY_TAX_ID"]); !errors.Is(err, ErrKybDocNotFound) {
		t.Fatalf("cross-merchant get should be ErrKybDocNotFound, got %v", err)
	}

	// Events emitted.
	var nEvents int
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM merchant_kyb_events WHERE merchant_id=$1`, mA).Scan(&nEvents)
	if nEvents < 5 {
		t.Fatalf("expected >=5 kyb events, got %d", nEvents)
	}

	// Invalid type + bad mime rejected.
	if _, _, err := svc.RequestUploadURL(ctx, mA, "SANDBOX", "NOT_A_TYPE", "image/jpeg"); !errors.Is(err, ErrKybInvalidType) {
		t.Fatalf("invalid type: %v", err)
	}
	if _, _, err := svc.RequestUploadURL(ctx, mA, "SANDBOX", "COMPANY_TAX_ID", "text/plain"); !errors.Is(err, ErrKybInvalidMime) {
		t.Fatalf("bad mime: %v", err)
	}
}
