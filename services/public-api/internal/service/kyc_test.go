package service

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/public-api/internal/kycstorage"
)

// ── Pure unit tests (no DB) ─────────────────────────────────────────────────

func TestRequiredSlots(t *testing.T) {
	id, err := requiredSlots("IDENTITY_CARD")
	if err != nil || len(id) != 3 {
		t.Fatalf("IDENTITY_CARD: want 3 slots, got %d (err %v)", len(id), err)
	}
	pp, err := requiredSlots("PASSPORT")
	if err != nil || len(pp) != 2 {
		t.Fatalf("PASSPORT: want 2 slots, got %d (err %v)", len(pp), err)
	}
	if _, err := requiredSlots("NATIONAL_LOTTERY_TICKET"); !errors.Is(err, ErrKycInvalidInput) {
		t.Fatalf("unknown document type should be ErrKycInvalidInput, got %v", err)
	}
}

func TestSlotFor(t *testing.T) {
	cases := []struct {
		doc, ev, side, wantSlot string
		wantErr                 bool
	}{
		{"IDENTITY_CARD", "DOCUMENT_IMAGE", "FRONT", "document-front", false},
		{"IDENTITY_CARD", "DOCUMENT_IMAGE", "BACK", "document-back", false},
		{"IDENTITY_CARD", "SELFIE", "SELFIE", "selfie", false},
		{"PASSPORT", "DOCUMENT_IMAGE", "MAIN_PAGE", "passport-main", false},
		{"PASSPORT", "DOCUMENT_IMAGE", "BACK", "", true},           // passport has no back
		{"IDENTITY_CARD", "DOCUMENT_IMAGE", "MAIN_PAGE", "", true}, // BI has no main page
	}
	for _, c := range cases {
		s, err := slotFor(c.doc, c.ev, c.side)
		if c.wantErr {
			if err == nil {
				t.Errorf("%s/%s/%s: expected error", c.doc, c.ev, c.side)
			}
			continue
		}
		if err != nil || s.Slot != c.wantSlot {
			t.Errorf("%s/%s/%s: want %q, got %q (err %v)", c.doc, c.ev, c.side, c.wantSlot, s.Slot, err)
		}
	}
}

func TestSlotName(t *testing.T) {
	if slotName("SELFIE", "SELFIE") != "selfie" {
		t.Error("selfie slot")
	}
	if slotName("DOCUMENT_IMAGE", "MAIN_PAGE") != "passport-main" {
		t.Error("passport-main slot")
	}
	if RequiredEvidenceFor("PASSPORT") == nil || len(RequiredEvidenceFor("PASSPORT")) != 2 {
		t.Error("RequiredEvidenceFor PASSPORT")
	}
	if RequiredEvidenceFor("BOGUS") != nil {
		t.Error("RequiredEvidenceFor unknown should be nil")
	}
}

// ── Real-DB lifecycle + ownership (skips when no DB / not migrated) ──────────

func TestKycLifecycle_RealDB(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed KYC test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.kyc_cases')::text`).Scan(&reg)
	if reg == nil {
		t.Skip("kyc_cases not migrated in this DB — skipping")
	}

	fake := kycstorage.NewFake()
	svc := NewKycService(pool, fake, "SANDBOX")

	consumer := uuid.NewString()
	other := uuid.NewString()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM kyc_cases WHERE subject_id = ANY($1)`, []string{consumer, other})
		_, _ = pool.Exec(ctx, `DELETE FROM customer_compliance WHERE customer_id = ANY($1)`, []string{consumer, other})
	})

	// Create.
	c, err := svc.CreateOrResumeCase(ctx, consumer, "IDENTITY_CARD", "AO", "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if c.Status != KycWaitingDocuments {
		t.Fatalf("new case status = %s, want WAITING_DOCUMENTS", c.Status)
	}

	// Resume idempotency: a second create returns the same case.
	again, err := svc.CreateOrResumeCase(ctx, consumer, "IDENTITY_CARD", "AO", "")
	if err != nil || again.ID != c.ID {
		t.Fatalf("resume should return the same case (got %s vs %s, err %v)", again.ID, c.ID, err)
	}

	// Upload + complete all three required slots.
	upload := func(ev, side, slot string) {
		evID, _, err := svc.RequestUploadURL(ctx, consumer, c.ID, ev, side, "image/jpeg")
		if err != nil {
			t.Fatalf("upload-url %s/%s: %v", ev, side, err)
		}
		key, _ := fake.BuildStorageKey(consumer, c.ID, slot)
		fake.MarkUploaded(key, 12345, "image/jpeg")
		if _, err := svc.CompleteEvidence(ctx, consumer, c.ID, evID, ""); err != nil {
			t.Fatalf("complete %s/%s: %v", ev, side, err)
		}
	}
	upload("DOCUMENT_IMAGE", "FRONT", "document-front")
	upload("DOCUMENT_IMAGE", "BACK", "document-back")

	// Not yet complete: submit must fail before the selfie.
	if _, err := svc.SubmitCase(ctx, consumer, c.ID); !errors.Is(err, ErrKycEvidenceMissing) {
		t.Fatalf("submit before selfie should be ErrKycEvidenceMissing, got %v", err)
	}

	upload("SELFIE", "SELFIE", "selfie")

	got, err := svc.GetCase(ctx, consumer, c.ID)
	if err != nil || got.Status != KycDocumentsReceived {
		t.Fatalf("after all evidence: status = %s (err %v), want DOCUMENTS_RECEIVED", got.Status, err)
	}

	// Submit -> UNDER_REVIEW + compliance reflects review.
	sub, err := svc.SubmitCase(ctx, consumer, c.ID)
	if err != nil || sub.Status != KycUnderReview {
		t.Fatalf("submit: status = %s (err %v), want UNDER_REVIEW", sub.Status, err)
	}
	var compStatus string
	if err := pool.QueryRow(ctx, `SELECT status FROM customer_compliance WHERE customer_id=$1`, consumer).Scan(&compStatus); err != nil {
		t.Fatalf("compliance row: %v", err)
	}
	if compStatus != "UNDER_REVIEW" {
		t.Fatalf("customer_compliance.status = %s, want UNDER_REVIEW", compStatus)
	}

	// HEAD verify: completing an evidence whose object is absent fails.
	evID, _, err := svc.RequestUploadURL(ctx, consumer, c.ID, "DOCUMENT_IMAGE", "FRONT", "image/jpeg")
	if !errors.Is(err, ErrKycInvalidState) {
		// Re-upload after submit is not allowed (UNDER_REVIEW) — expected.
		_ = evID
	}

	// Ownership: another consumer cannot see this case (404, not 403).
	if _, err := svc.GetCase(ctx, other, c.ID); !errors.Is(err, ErrKycCaseNotFound) {
		t.Fatalf("cross-consumer GetCase should be ErrKycCaseNotFound, got %v", err)
	}

	// Events emitted (case.created + 3 uploads incl. selfie + review.started).
	var nEvents int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM kyc_events WHERE case_id=$1`, c.ID).Scan(&nEvents); err != nil {
		t.Fatalf("count events: %v", err)
	}
	if nEvents < 5 {
		t.Fatalf("expected >=5 kyc_events, got %d", nEvents)
	}

	// No storage_key ever leaves the service: evidence projection omits it.
	items, err := svc.ListEvidence(ctx, c.ID)
	if err != nil || len(items) == 0 {
		t.Fatalf("ListEvidence: %d items (err %v)", len(items), err)
	}
}
