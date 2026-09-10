package service

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// validateUpload and the storage-not-configured guard are pure (no DB), so they
// are unit-testable without a database.

func newSvcNoStorage() *PostgresMerchantDocumentService {
	// pool is never touched on the not-configured / validation-only paths.
	return NewPostgresMerchantDocumentService(nil, nil, 5*1024*1024)
}

func TestStorageNotConfigured(t *testing.T) {
	s := newSvcNoStorage()
	if s.StorageConfigured() {
		t.Fatal("StorageConfigured should be false with nil storage")
	}
	if _, err := s.RequestUpload(context.Background(), "app", "TAX_ID", "nif.pdf", "application/pdf", 100); err != ErrStorageNotConfigured {
		t.Fatalf("RequestUpload: want ErrStorageNotConfigured, got %v", err)
	}
	if _, err := s.ConfirmUpload(context.Background(), "app", "doc"); err != ErrStorageNotConfigured {
		t.Fatalf("ConfirmUpload: want ErrStorageNotConfigured, got %v", err)
	}
	if _, err := s.CreateReadURL(context.Background(), "app", "doc"); err != ErrStorageNotConfigured {
		t.Fatalf("CreateReadURL: want ErrStorageNotConfigured, got %v", err)
	}
}

// A file that could never be accepted is refused for what it is even where
// storage is absent: the applicant is told "not this file", not "try later".
func TestRequestUploadRefusesTheFileBeforeAskingStorage(t *testing.T) {
	s := newSvcNoStorage()
	if _, err := s.RequestUpload(context.Background(), "app", "BUSINESS_REGISTRATION", "x.exe", "application/x-msdownload", 10); err != ErrInvalidMimeType {
		t.Fatalf("executable without storage: want ErrInvalidMimeType, got %v", err)
	}
	if _, err := s.RequestUpload(context.Background(), "app", "BUSINESS_REGISTRATION", "big.pdf", "application/pdf", 6*1024*1024); err != ErrFileTooLarge {
		t.Fatalf("oversized without storage: want ErrFileTooLarge, got %v", err)
	}
}

func TestValidateUpload(t *testing.T) {
	s := NewPostgresMerchantDocumentService(nil, nil, 1000)
	cases := []struct {
		name     string
		docType  string
		filename string
		mime     string
		size     int64
		want     error
	}{
		{"ok registration", "BUSINESS_REGISTRATION", "rc.pdf", "application/pdf", 500, nil},
		{"ok pdf", "TAX_ID", "nif.pdf", "application/pdf", 500, nil},
		{"ok jpg", "REPRESENTATIVE_ID", "bi.JPG", "image/jpeg", 500, nil},
		// Bank proof was removed from the application KYB and must now be rejected
		// (banking details belong to a later payout-configuration phase).
		{"bank proof removed", "BANK_PROOF", "iban.pdf", "application/pdf", 500, ErrInvalidDocumentType},
		// Proof-of-address was removed from KYB and must now be rejected.
		{"proof of address removed", "PROOF_OF_ADDRESS", "morada.pdf", "application/pdf", 500, ErrInvalidDocumentType},
		{"bad type", "PASSPORT", "x.pdf", "application/pdf", 10, ErrInvalidDocumentType},
		{"bad mime", "TAX_ID", "x.pdf", "application/zip", 10, ErrInvalidMimeType},
		{"bad ext", "TAX_ID", "x.docx", "application/pdf", 10, ErrInvalidExtension},
		{"no ext", "TAX_ID", "noext", "application/pdf", 10, ErrInvalidExtension},
		{"empty", "TAX_ID", "x.pdf", "application/pdf", 0, ErrEmptyFile},
		{"too large", "TAX_ID", "x.pdf", "application/pdf", 1001, ErrFileTooLarge},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := s.validateUpload(c.docType, c.filename, c.mime, c.size); got != c.want {
				t.Fatalf("validateUpload(%s) = %v, want %v", c.name, got, c.want)
			}
		})
	}
}

// The public projection must never leak storage internals.
func TestPublicViewHasNoStorageKey(t *testing.T) {
	b, _ := json.Marshal(DocumentView{DocumentID: "d", DocumentType: "TAX_ID", OriginalName: "nif.pdf", Status: "UPLOADED"})
	for _, banned := range []string{"storage_key", "storage_bucket", "bucket"} {
		if strings.Contains(string(b), banned) {
			t.Fatalf("DocumentView JSON leaks %q: %s", banned, b)
		}
	}
	a, _ := json.Marshal(AdminDocumentView{DocumentID: "d", DocumentType: "TAX_ID"})
	for _, banned := range []string{"storage_key", "storage_bucket"} {
		if strings.Contains(string(a), banned) {
			t.Fatalf("AdminDocumentView JSON leaks %q: %s", banned, a)
		}
	}
}
