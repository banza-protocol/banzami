package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

// A5-05. Accepting a KYB document was an unconditional update: a document whose
// upload never happened could be accepted, counted as present, and the Business
// approved with no file in storage; a decided application's documents could be
// flipped afterwards. A decision is now taken on an uploaded file of an
// application still under review, or refused with the reason.
func TestDocumentDecision_NeedsAFileAndAnOpenApplication(t *testing.T) {
	pool := dbPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()
	svc := NewPostgresMerchantDocumentService(pool, nil, 0)

	appID := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO merchant_applications (id, origin, status, environment, desired_handle, business_name, email)
	      VALUES ($1,'STANDALONE_BUSINESS','UNDER_REVIEW','SANDBOX',$2,'Decisão',$3)`,
		appID, "dd"+appID[:8], appID[:8]+"@example.test"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM merchant_application_documents WHERE application_id=$1`, appID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM merchant_applications WHERE id=$1`, appID)
	})
	doc := func(typ, status string) string {
		id := uuid.NewString()
		if _, err := pool.Exec(ctx,
			`INSERT INTO merchant_application_documents
			   (id, application_id, document_type, original_filename, storage_bucket, storage_key, mime_type, size_bytes, status)
			 VALUES ($1,$2,$3,'doc.pdf','test',$4,'application/pdf',1024,$5)`,
			id, appID, typ, "kyb/test/"+id, status); err != nil {
			t.Fatal(err)
		}
		return id
	}
	pending := doc("TAX_ID", "PENDING_UPLOAD")
	uploaded := doc("BUSINESS_REGISTRATION", "UPLOADED")

	if _, err := svc.Accept(ctx, appID, pending, "op"); !errors.Is(err, ErrDocumentNotUploaded) {
		t.Fatalf("a document never uploaded was accepted (err=%v)", err)
	}
	var st string
	_ = pool.QueryRow(ctx, `SELECT status FROM merchant_application_documents WHERE id=$1`, pending).Scan(&st)
	if st != "PENDING_UPLOAD" {
		t.Fatalf("the refused decision still changed the document to %s", st)
	}
	if _, err := svc.Accept(ctx, appID, uploaded, "op"); err != nil {
		t.Fatalf("an uploaded document could not be accepted: %v", err)
	}

	// Decided: the documents are what the decision saw.
	if _, err := pool.Exec(ctx, `UPDATE merchant_applications SET status='REJECTED' WHERE id=$1`, appID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Reject(ctx, appID, uploaded, "op", "late change"); !errors.Is(err, ErrApplicationClosed) {
		t.Fatalf("a decided application's document was changed (err=%v)", err)
	}
}
