package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/admin-api/internal/kycstorage"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// When SANDBOX is requested but no staging pool is configured, the KYC endpoints
// must respond 503 — never fall back to live data.
func TestKyc_SandboxNotConfigured(t *testing.T) {
	h := NewKycReviewHandler(nil, nil) // sandbox == nil

	for _, tc := range []struct{ name, method, path string }{
		{"list", http.MethodGet, "/admin/v1/kyc/cases?environment=SANDBOX"},
		{"get", http.MethodGet, "/admin/v1/kyc/cases/x?environment=SANDBOX"},
		{"read-url", http.MethodPost, "/admin/v1/kyc/evidence/x/read-url?environment=SANDBOX"},
		{"approve", http.MethodPost, "/admin/v1/kyc/cases/x/approve?environment=SANDBOX"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req := httptest.NewRequest(tc.method, tc.path, http.NoBody)
			switch tc.name {
			case "list":
				h.List(w, req)
			case "get":
				h.Get(w, req)
			case "read-url":
				h.ReadURL(w, req)
			case "approve":
				h.Approve(w, req)
			}
			if w.Code != http.StatusServiceUnavailable {
				t.Fatalf("%s sandbox-not-configured: want 503, got %d", tc.name, w.Code)
			}
		})
	}
}

func kycDBOrSkip(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed KYC handler test")
	}
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	var reg *string
	_ = pool.QueryRow(context.Background(), `SELECT to_regclass('public.kyc_cases')::text`).Scan(&reg)
	if reg == nil {
		pool.Close()
		t.Skip("kyc_cases not migrated — skipping")
	}
	return pool
}

// read-url is audited with the canonical access action per intent, and the signed
// URL the storage returns must NEVER appear in the audit snapshot.
func TestKyc_ReadURL_AuditsAccessWithoutLeakingURL(t *testing.T) {
	pool := kycDBOrSkip(t)
	defer pool.Close()
	ctx := context.Background()

	sub := uuid.NewString()
	caseID := uuid.NewString()
	evID := uuid.NewString()
	key := "kyc/consumer/" + caseID + "/document-front"
	if _, err := pool.Exec(ctx,
		`INSERT INTO kyc_cases (id, operator_id, subject_type, subject_id, status, environment)
		 VALUES ($1,'banzami','CONSUMER',$2,'UNDER_REVIEW','SANDBOX')`, caseID, sub); err != nil {
		t.Fatalf("seed case: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO kyc_evidence (id, case_id, evidence_type, side, storage_bucket, storage_key, mime_type, status, environment, uploaded_at)
		 VALUES ($1,$2,'DOCUMENT_IMAGE','FRONT','banzami-kyc-sandbox',$3,'image/jpeg','UPLOADED','SANDBOX',NOW())`,
		evID, caseID, key); err != nil {
		t.Fatalf("seed evidence: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM kyc_evidence WHERE case_id=$1`, caseID)
		_, _ = pool.Exec(ctx, `DELETE FROM kyc_cases WHERE id=$1`, caseID)
	})

	h := NewKycReviewHandler(service.NewKycReviewService(pool, kycstorage.NewFake()), nil)

	for _, tc := range []struct{ intent, action string }{
		{"view", "VIEW_KYC_DOCUMENT"},
		{"download", "DOWNLOAD_KYC_DOCUMENT"},
		{"copy", "COPY_KYC_SIGNED_URL"},
		{"", "VIEW_KYC_DOCUMENT"},
	} {
		sink := &annSink{}
		w := httptest.NewRecorder()
		auditedRoute(sink, http.MethodPost, "/admin/v1/kyc/evidence/{id}/read-url", h.ReadURL).
			ServeHTTP(w, httptest.NewRequest(http.MethodPost,
				"/admin/v1/kyc/evidence/"+evID+"/read-url", strings.NewReader(`{"intent":"`+tc.intent+`"}`)))

		if w.Code != http.StatusOK {
			t.Fatalf("intent=%q: want 200, got %d (%s)", tc.intent, w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "fake-r2.local") {
			t.Fatalf("intent=%q: signed url must be forwarded to the operator", tc.intent)
		}
		if len(sink.entries) != 1 {
			t.Fatalf("intent=%q: want one audit row, got %d", tc.intent, len(sink.entries))
		}
		e := sink.entries[0]
		if e.Action != tc.action || e.EntityType != "kyc_evidence" || e.EntityID != evID {
			t.Fatalf("intent=%q: unexpected audit entity/action: %+v", tc.intent, e)
		}
		assertNoSecret(t, e)
		// The signed URL (and its host) must never reach the audit snapshot.
		if snap := snapshot(e); strings.Contains(snap, "fake-r2.local") || strings.Contains(snap, "X-Amz-Signature") {
			t.Fatalf("intent=%q: signed url leaked into audit snapshot: %s", tc.intent, snap)
		}
	}
}

// approve forwards notes to the service but audits only decision + level, and the
// internal notes never enter the audit snapshot.
func TestKyc_Approve_AuditsDecisionNotNotes(t *testing.T) {
	pool := kycDBOrSkip(t)
	defer pool.Close()
	ctx := context.Background()

	sub := uuid.NewString()
	caseID := uuid.NewString()
	if _, err := pool.Exec(ctx,
		`INSERT INTO kyc_cases (id, operator_id, subject_type, subject_id, status, environment)
		 VALUES ($1,'banzami','CONSUMER',$2,'UNDER_REVIEW','LIVE')`, caseID, sub); err != nil {
		t.Fatalf("seed case: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM kyc_events WHERE case_id=$1`, caseID)
		_, _ = pool.Exec(ctx, `DELETE FROM kyc_reviews WHERE case_id=$1`, caseID)
		_, _ = pool.Exec(ctx, `DELETE FROM kyc_cases WHERE id=$1`, caseID)
		_, _ = pool.Exec(ctx, `DELETE FROM customer_compliance WHERE customer_id=$1`, sub)
	})

	h := NewKycReviewHandler(service.NewKycReviewService(pool, nil), nil)
	sink := &annSink{}
	w := httptest.NewRecorder()
	auditedRoute(sink, http.MethodPost, "/admin/v1/kyc/cases/{id}/approve", h.Approve).
		ServeHTTP(w, httptest.NewRequest(http.MethodPost,
			"/admin/v1/kyc/cases/"+caseID+"/approve", strings.NewReader(`{"granted_level":"ENHANCED","notes":"verifiquei o BI"}`)))

	if w.Code != http.StatusOK {
		t.Fatalf("approve: want 200, got %d (%s)", w.Code, w.Body.String())
	}
	if len(sink.entries) != 1 {
		t.Fatalf("approve must write one audit row, got %d", len(sink.entries))
	}
	e := sink.entries[0]
	if e.Action != "APPROVE_KYC" || e.EntityType != "kyc_case" || e.EntityID != caseID {
		t.Fatalf("unexpected audit action/entity: %+v", e)
	}
	after, _ := e.After.(map[string]any)
	if after["decision"] != "APPROVED" || after["granted_level"] != "ENHANCED" {
		t.Fatalf("after payload missing decision/level: %v", e.After)
	}
	if strings.Contains(snapshot(e), "verifiquei o BI") {
		t.Fatalf("internal notes leaked into audit snapshot: %s", snapshot(e))
	}
}
