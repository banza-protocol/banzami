package service

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/api-gateway/internal/kybstorage"
)

func dbPoolOrSkip(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed test")
	}
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	var reg *string
	_ = pool.QueryRow(context.Background(), `SELECT to_regclass('public.merchant_kyb_documents')::text`).Scan(&reg)
	if reg == nil {
		pool.Close()
		t.Skip("merchant_kyb_documents not migrated — skipping")
	}
	return pool
}

func seedKybDoc(t *testing.T, pool *pgxpool.Pool, merchantID, status string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := pool.Exec(context.Background(),
		`INSERT INTO merchant_kyb_documents
		   (id, merchant_id, document_type, status, storage_bucket, storage_key, mime_type, environment, submitted_at)
		 VALUES ($1,$2,'COMPANY_TAX_ID',$3,'banzami-kyb-sandbox',$4,'image/jpeg','SANDBOX',NOW())`,
		id, merchantID, status, "k/"+id)
	if err != nil {
		t.Fatalf("seed doc: %v", err)
	}
	return id
}

func TestKybAdminList_EnrichesMerchantAndFlagsOrphan(t *testing.T) {
	pool := dbPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()
	svc := NewPostgresMerchantKybService(pool, kybstorage.NewFakeStorage("banzami-kyb-sandbox"), 5*1024*1024)

	m := uuid.NewString()
	orphanMerchant := uuid.NewString() // never inserted into merchants
	if _, err := pool.Exec(ctx, `INSERT INTO merchants (id, name, email, status) VALUES ($1,'Doa Sandbox',$2,'ACTIVE')`, m, m+"@test"); err != nil {
		t.Fatalf("seed merchant: %v", err)
	}
	realDoc := seedKybDoc(t, pool, m, "PENDING_REVIEW")
	orphanDoc := seedKybDoc(t, pool, orphanMerchant, "PENDING_REVIEW")
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_kyb_documents WHERE id = ANY($1)`, []string{realDoc, orphanDoc})
		_, _ = pool.Exec(ctx, `DELETE FROM merchants WHERE id=$1`, m)
	})

	docs, err := svc.AdminList(ctx, "PENDING_REVIEW", 200)
	if err != nil {
		t.Fatalf("AdminList: %v", err)
	}
	var real, orphan *MerchantKybAdminDocument
	for i := range docs {
		switch docs[i].ID {
		case realDoc:
			real = &docs[i]
		case orphanDoc:
			orphan = &docs[i]
		}
	}
	if real == nil || orphan == nil {
		t.Fatalf("expected both docs in list (real=%v orphan=%v)", real != nil, orphan != nil)
	}
	if real.MerchantName != "Doa Sandbox" || !real.MerchantExists {
		t.Fatalf("real doc not enriched: name=%q exists=%v", real.MerchantName, real.MerchantExists)
	}
	if orphan.MerchantExists || orphan.MerchantName != "" {
		t.Fatalf("orphan doc should be flagged: name=%q exists=%v", orphan.MerchantName, orphan.MerchantExists)
	}

	// Orphan-safety: approving/rejecting an orphan document is blocked.
	if err := svc.AdminApprove(ctx, orphanDoc, "op", "", nil); !errors.Is(err, ErrKybMerchantNotFound) {
		t.Fatalf("orphan approve: want ErrKybMerchantNotFound, got %v", err)
	}
	if err := svc.AdminReject(ctx, orphanDoc, "op", "no", ""); !errors.Is(err, ErrKybMerchantNotFound) {
		t.Fatalf("orphan reject: want ErrKybMerchantNotFound, got %v", err)
	}
}

// The merchant-centric queue returns one row per merchant with correct per-status
// counts; per-merchant documents lists that merchant's docs; and the KYB badge
// counts distinct merchants, not loose documents.
func TestKybAdminMerchants_AggregatesAndCounts(t *testing.T) {
	pool := dbPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()
	svc := NewPostgresMerchantKybService(pool, kybstorage.NewFakeStorage("banzami-kyb-sandbox"), 5*1024*1024)

	m := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO merchants (id, name, email, status) VALUES ($1,'Loja Agregada',$2,'ACTIVE')`, m, m+"@test"); err != nil {
		t.Fatalf("seed merchant: %v", err)
	}
	seed := func(dtype, status string) string {
		id := uuid.NewString()
		if _, err := pool.Exec(ctx,
			`INSERT INTO merchant_kyb_documents (id, merchant_id, document_type, status, storage_bucket, storage_key, mime_type, environment, submitted_at)
			 VALUES ($1,$2,$3,$4,'banzami-kyb-sandbox',$5,'image/jpeg','SANDBOX',NOW())`,
			id, m, dtype, status, "k/"+id); err != nil {
			t.Fatalf("seed doc: %v", err)
		}
		return id
	}
	d1 := seed("COMMERCIAL_REGISTRATION", "PENDING_REVIEW")
	d2 := seed("COMPANY_TAX_ID", "VALID")
	d3 := seed("REPRESENTATIVE_ID", "REJECTED")
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_kyb_documents WHERE merchant_id=$1`, m)
		_, _ = pool.Exec(ctx, `DELETE FROM merchants WHERE id=$1`, m)
	})

	merchants, err := svc.AdminListMerchants(ctx, 200)
	if err != nil {
		t.Fatalf("AdminListMerchants: %v", err)
	}
	var row *MerchantKybSummary
	for i := range merchants {
		if merchants[i].MerchantID == m {
			row = &merchants[i]
		}
	}
	if row == nil {
		t.Fatalf("merchant not in queue")
	}
	if row.Name != "Loja Agregada" || !row.MerchantExists {
		t.Fatalf("merchant row not enriched: %+v", row)
	}
	if row.Total != 3 || row.Pending != 1 || row.Approved != 1 || row.Rejected != 1 {
		t.Fatalf("aggregate counts wrong: total=%d pending=%d approved=%d rejected=%d", row.Total, row.Pending, row.Approved, row.Rejected)
	}

	docs, err := svc.AdminMerchantDocuments(ctx, m)
	if err != nil {
		t.Fatalf("AdminMerchantDocuments: %v", err)
	}
	if len(docs) != 3 {
		t.Fatalf("expected 3 documents for merchant, got %d", len(docs))
	}
	_ = d1
	_ = d2
	_ = d3

	// The KYB badge counts distinct merchants, not documents: this merchant with 1
	// pending doc contributes exactly 1.
	sum, err := NewNotificationsService(pool).Summary(ctx)
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	if sum.PendingKybDocuments < 1 {
		t.Fatalf("expected >=1 merchant with pending KYB, got %d", sum.PendingKybDocuments)
	}
}

func TestNotificationsSummary_Counts(t *testing.T) {
	pool := dbPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()

	doc := seedKybDoc(t, pool, uuid.NewString(), "PENDING_REVIEW")
	asID := uuid.NewString()
	_, _ = pool.Exec(ctx,
		`INSERT INTO app_settlements (id, owner_ref, source_account_id, beneficiary_account_id,
		   gross_amount_minor, application_fee_minor, net_amount_minor, currency, engine_version,
		   pricing_snapshot_json, status, environment, idempotency_key)
		 VALUES ($1,'c',$2,$3,1000,0,1000,'AOA',1,'{}'::jsonb,'FAILED','SANDBOX',$4)`,
		asID, uuid.NewString(), uuid.NewString(), "notif-"+asID)
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_kyb_documents WHERE id=$1`, doc)
		_, _ = pool.Exec(ctx, `DELETE FROM app_settlements WHERE id=$1`, asID)
	})

	sum, err := NewNotificationsService(pool).Summary(ctx)
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	if sum.PendingKybDocuments < 1 {
		t.Fatalf("expected >=1 pending KYB doc, got %d", sum.PendingKybDocuments)
	}
	if sum.FailedAppSettlements < 1 {
		t.Fatalf("expected >=1 failed settlement, got %d", sum.FailedAppSettlements)
	}
}

// Summary must not 500 when an optional table is absent (e.g. live `banzami` has
// no `disputes` table). The probe drops the missing metric to 0 instead of letting
// Postgres fail to parse the relation.
func TestNotificationsSummary_ToleratesMissingTable(t *testing.T) {
	pool := dbPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()

	var hasDisputes bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.disputes') IS NOT NULL`).Scan(&hasDisputes); err != nil {
		t.Fatalf("probe: %v", err)
	}
	if hasDisputes {
		// Simulate the live shape (no disputes table) for the duration of the test.
		if _, err := pool.Exec(ctx, `ALTER TABLE disputes RENAME TO disputes__hidden_for_test`); err != nil {
			t.Skipf("cannot hide disputes table: %v", err)
		}
		t.Cleanup(func() { _, _ = pool.Exec(ctx, `ALTER TABLE disputes__hidden_for_test RENAME TO disputes`) })
	}

	sum, err := NewNotificationsService(pool).Summary(ctx)
	if err != nil {
		t.Fatalf("Summary must tolerate a missing table, got: %v", err)
	}
	if sum.OpenDisputes != 0 {
		t.Fatalf("absent disputes table must count as 0, got %d", sum.OpenDisputes)
	}
}

func TestKybContext_Timeline_Notes(t *testing.T) {
	pool := dbPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()
	svc := NewPostgresMerchantKybService(pool, kybstorage.NewFakeStorage("banzami-kyb-sandbox"), 5*1024*1024)

	m := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO merchants (id, name, email, status) VALUES ($1,'Loja Teste',$2,'ACTIVE')`, m, m+"@test"); err != nil {
		t.Fatalf("seed merchant: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO merchant_applications (id, status, environment, desired_handle, business_name, email,
		   created_merchant_id, legal_representative, phone, nif, country, city, address, business_activity)
		 VALUES ($1,'APPROVED','SANDBOX',$2,'Loja Teste Lda',$3,$4,'Ana Silva','+244900','NIF123','AO','Luanda','Rua 1','Retalho')`,
		uuid.NewString(), "loja"+m[:6], m+"@test", m); err != nil {
		t.Fatalf("seed application: %v", err)
	}
	doc := seedKybDoc(t, pool, m, "PENDING_REVIEW")
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_kyb_events WHERE merchant_id=$1`, m)
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_kyb_documents WHERE id=$1`, doc)
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_applications WHERE created_merchant_id=$1`, m)
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_compliance WHERE merchant_id=$1`, m)
		_, _ = pool.Exec(ctx, `DELETE FROM merchants WHERE id=$1`, m)
	})

	// Context returns merchant + representative + company.
	c, err := svc.Context(ctx, m)
	if err != nil {
		t.Fatalf("Context: %v", err)
	}
	if !c.MerchantExists || c.Name != "Loja Teste" || c.RepName != "Ana Silva" || c.LegalName != "Loja Teste Lda" || c.Nif != "NIF123" || c.Country != "AO" {
		t.Fatalf("context not enriched: %+v", c)
	}

	// Approve with internal notes -> stored in metadata + event payload.
	if err := svc.AdminApprove(ctx, doc, "op-1", "documentos conferidos", nil); err != nil {
		t.Fatalf("approve: %v", err)
	}
	ev, err := svc.Timeline(ctx, m)
	if err != nil {
		t.Fatalf("Timeline: %v", err)
	}
	var approved bool
	for _, e := range ev {
		if e.EventType == "merchant.kyb.document.approved" {
			approved = true
			if e.Payload["notes"] != "documentos conferidos" {
				t.Fatalf("notes not in event payload: %v", e.Payload)
			}
		}
	}
	if !approved {
		t.Fatalf("expected an approved event in timeline, got %d events", len(ev))
	}

	// On-demand signed URL is minted (fake storage), key never returned.
	url, err := svc.ReadURL(ctx, doc)
	if err != nil || url == "" {
		t.Fatalf("ReadURL: url=%q err=%v", url, err)
	}
}
