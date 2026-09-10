package service

// A document is what arrived, not what the uploader declared. The upload URL is
// signed for the host only, so the store enforces neither size nor type; the
// confirm step is the first place the bytes are seen, and the only place they
// can be refused before a reviewer opens them.

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/banzami/banzami/services/api-gateway/internal/kybstorage"
)

func TestSniffDocumentType(t *testing.T) {
	cases := map[string]string{
		"%PDF-1.7\n":            "application/pdf",
		"\x89PNG\r\n\x1a\n\x00": "image/png",
		"\xff\xd8\xff\xe0JFIF":  "image/jpeg",
		"MZ\x90\x00":            "", // a Windows executable
		"<html><script>":        "", // markup
		"PK\x03\x04":            "", // a zip (docx, apk…)
		"":                      "",
	}
	for head, want := range cases {
		if got := sniffDocumentType([]byte(head)); got != want {
			t.Errorf("sniff(%q) = %q, want %q", head, got, want)
		}
	}
}

func docFixture(t *testing.T, status string) (*PostgresMerchantDocumentService, *kybstorage.FakeStorage, string, func()) {
	t.Helper()
	ctx := context.Background()
	pool := appAdminPoolOrSkip(ctx, t)
	store := kybstorage.NewFakeStorage("test-bucket")
	svc := NewPostgresMerchantDocumentService(pool, store, 1024)
	appID := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO merchant_applications (origin, id, status, environment, desired_handle, business_name, email)
	    VALUES ('STANDALONE_BUSINESS',$1,$2,'SANDBOX',$3,'Doc Co','doc@example.test')`, appID, status, "dc"+hex10()); err != nil {
		t.Fatal(err)
	}
	return svc, store, appID, func() {
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_application_documents WHERE application_id=$1`, appID)
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_applications WHERE id=$1`, appID)
		pool.Close()
	}
}

func keyOf(t *testing.T, svc *PostgresMerchantDocumentService, docID string) string {
	var k string
	if err := svc.pool.QueryRow(context.Background(), `SELECT storage_key FROM merchant_application_documents WHERE id=$1`, docID).Scan(&k); err != nil {
		t.Fatal(err)
	}
	return k
}

func TestConfirmUpload_RefusesARenamedExecutableAndDeletesIt(t *testing.T) {
	svc, store, appID, done := docFixture(t, "SUBMITTED")
	defer done()
	ctx := context.Background()
	up, err := svc.RequestUpload(ctx, appID, "BUSINESS_REGISTRATION", "registo.pdf", "application/pdf", 100)
	if err != nil {
		t.Fatal(err)
	}
	key := keyOf(t, svc, up.DocumentID)
	store.PutObjectBytes(key, []byte("MZ\x90\x00 this is not a pdf"), "application/pdf")
	if _, err := svc.ConfirmUpload(ctx, appID, up.DocumentID); !errors.Is(err, ErrContentMismatch) {
		t.Fatalf("err = %v", err)
	}
	if len(store.Deleted) != 1 || store.Deleted[0] != key {
		t.Fatalf("the refused object was not deleted: %v", store.Deleted)
	}
	var status, reason string
	_ = svc.pool.QueryRow(ctx, `SELECT status, rejection_reason FROM merchant_application_documents WHERE id=$1`, up.DocumentID).Scan(&status, &reason)
	if status != "REJECTED" || reason != "CONTENT_MISMATCH" {
		t.Fatalf("status=%s reason=%s", status, reason)
	}
	if missing, _ := (&PostgresMerchantApplicationAdminService{pool: svc.pool}).missingDocuments(ctx, appID); len(missing) != 2 {
		t.Fatalf("a refused file counted towards the required documents: missing=%v", missing)
	}
}

func TestConfirmUpload_RefusesAnObjectLargerThanTheLimit(t *testing.T) {
	svc, store, appID, done := docFixture(t, "SUBMITTED")
	defer done()
	ctx := context.Background()
	up, err := svc.RequestUpload(ctx, appID, "REPRESENTATIVE_ID", "bi.pdf", "application/pdf", 100)
	if err != nil {
		t.Fatal(err)
	}
	// Declared 100 bytes; 4 KiB arrived (the limit here is 1 KiB).
	store.PutObjectBytes(keyOf(t, svc, up.DocumentID), append([]byte("%PDF-1.7\n"), make([]byte, 4096)...), "application/pdf")
	if _, err := svc.ConfirmUpload(ctx, appID, up.DocumentID); !errors.Is(err, ErrFileTooLarge) {
		t.Fatalf("err = %v", err)
	}
}

func TestConfirmUpload_AcceptsAGenuineFile(t *testing.T) {
	svc, store, appID, done := docFixture(t, "SUBMITTED")
	defer done()
	ctx := context.Background()
	up, err := svc.RequestUpload(ctx, appID, "REPRESENTATIVE_ID", "bi.png", "image/png", 64)
	if err != nil {
		t.Fatal(err)
	}
	store.PutObjectBytes(keyOf(t, svc, up.DocumentID), []byte("\x89PNG\r\n\x1a\nSANDBOX TEST DOCUMENT"), "image/png")
	if _, err := svc.ConfirmUpload(ctx, appID, up.DocumentID); err != nil {
		t.Fatal(err)
	}
}

func TestRequestUpload_ADecidedApplicationTakesNoMoreDocuments(t *testing.T) {
	for _, st := range []string{"REJECTED", "CANCELLED"} {
		svc, _, appID, done := docFixture(t, st)
		if _, err := svc.RequestUpload(context.Background(), appID, "OTHER", "x.pdf", "application/pdf", 10); !errors.Is(err, ErrApplicationClosed) {
			t.Errorf("%s: err = %v", st, err)
		}
		done()
	}
}
