package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/kybstorage"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// fakeDocSvc is a configurable in-memory MerchantDocumentService for HTTP tests.
type fakeDocSvc struct {
	requestErr error
	confirmErr error
	readErr    error
	configured bool
}

func (f *fakeDocSvc) StorageConfigured() bool { return f.configured }

func (f *fakeDocSvc) RequestUpload(_ context.Context, _, docType, _, _ string, _ int64) (service.RequestUploadResult, error) {
	if f.requestErr != nil {
		return service.RequestUploadResult{}, f.requestErr
	}
	return service.RequestUploadResult{
		DocumentID: "doc-123",
		Upload: kybstorage.UploadURL{
			URL:     "https://fake-r2.local/bucket/kyb/sandbox/app/doc/abc?sig=upload",
			Method:  "PUT",
			Headers: map[string]string{"content-type": "application/pdf"},
		},
	}, nil
}

func (f *fakeDocSvc) ConfirmUpload(_ context.Context, _, _ string) (service.DocumentView, error) {
	if f.confirmErr != nil {
		return service.DocumentView{}, f.confirmErr
	}
	return service.DocumentView{DocumentID: "doc-123", DocumentType: "TAX_ID", OriginalName: "nif.pdf", Status: "UPLOADED", SizeBytes: 100}, nil
}

func (f *fakeDocSvc) ListForApplication(_ context.Context, _ string) ([]service.DocumentView, error) {
	return []service.DocumentView{{DocumentID: "doc-123", DocumentType: "TAX_ID", OriginalName: "nif.pdf", Status: "UPLOADED", SizeBytes: 100}}, nil
}

func (f *fakeDocSvc) AdminList(_ context.Context, _ string) ([]service.AdminDocumentView, error) {
	return []service.AdminDocumentView{{DocumentID: "doc-123", DocumentType: "TAX_ID", OriginalName: "nif.pdf", MimeType: "application/pdf", Status: "UPLOADED"}}, nil
}

func (f *fakeDocSvc) CreateReadURL(_ context.Context, _, _ string) (service.ReadURLResult, error) {
	if f.readErr != nil {
		return service.ReadURLResult{}, f.readErr
	}
	return service.ReadURLResult{URL: "https://fake-r2.local/bucket/key?sig=read"}, nil
}

func (f *fakeDocSvc) Accept(_ context.Context, _, _, _ string) (service.AdminDocumentView, error) {
	return service.AdminDocumentView{DocumentID: "doc-123", Status: "ACCEPTED"}, nil
}

func (f *fakeDocSvc) Reject(_ context.Context, _, _, _, reason string) (service.AdminDocumentView, error) {
	return service.AdminDocumentView{DocumentID: "doc-123", Status: "REJECTED", RejectionReason: &reason}, nil
}

func router(svc service.MerchantDocumentService) http.Handler {
	h := NewMerchantDocumentHandler(svc)
	r := chi.NewRouter()
	r.Post("/v1/merchant/applications/{id}/documents/upload-url", h.RequestUploadURL)
	r.Post("/v1/merchant/applications/{id}/documents/{document_id}/confirm", h.ConfirmUpload)
	r.Get("/v1/merchant/applications/{id}/documents", h.ListDocuments)
	r.Get("/internal/{id}/documents", h.AdminList)
	r.Post("/internal/{id}/documents/{document_id}/read-url", h.AdminReadURL)
	r.Post("/internal/{id}/documents/{document_id}/accept", h.AdminAccept)
	r.Post("/internal/{id}/documents/{document_id}/reject", h.AdminReject)
	return r
}

func do(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if body != "" {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestUploadURL_Success(t *testing.T) {
	w := do(t, router(&fakeDocSvc{configured: true}), "POST",
		"/v1/merchant/applications/app-1/documents/upload-url",
		`{"document_type":"TAX_ID","filename":"nif.pdf","mime_type":"application/pdf","size_bytes":100}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, body=%s", w.Code, w.Body.String())
	}
	for _, want := range []string{`"document_id":"doc-123"`, `"upload_url":`, `"method":"PUT"`} {
		if !strings.Contains(w.Body.String(), want) {
			t.Errorf("body missing %q: %s", want, w.Body.String())
		}
	}
}

func TestUploadURL_StorageNotConfigured(t *testing.T) {
	w := do(t, router(&fakeDocSvc{requestErr: service.ErrStorageNotConfigured}), "POST",
		"/v1/merchant/applications/app-1/documents/upload-url",
		`{"document_type":"TAX_ID","filename":"nif.pdf","mime_type":"application/pdf","size_bytes":100}`)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "STORAGE_NOT_CONFIGURED") {
		t.Fatalf("missing code: %s", w.Body.String())
	}
}

func TestUploadURL_ValidationErrors(t *testing.T) {
	cases := []struct {
		err  error
		code int
		body string
	}{
		{service.ErrInvalidMimeType, http.StatusBadRequest, "INVALID_MIME_TYPE"},
		{service.ErrInvalidDocumentType, http.StatusBadRequest, "INVALID_DOCUMENT_TYPE"},
		{service.ErrInvalidExtension, http.StatusBadRequest, "INVALID_EXTENSION"},
		{service.ErrFileTooLarge, http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE"},
		{service.ErrEmptyFile, http.StatusBadRequest, "EMPTY_FILE"},
		{service.ErrApplicationNotFound, http.StatusNotFound, "APPLICATION_NOT_FOUND"},
	}
	for _, c := range cases {
		w := do(t, router(&fakeDocSvc{requestErr: c.err}), "POST",
			"/v1/merchant/applications/app-1/documents/upload-url",
			`{"document_type":"TAX_ID","filename":"nif.pdf","mime_type":"application/pdf","size_bytes":100}`)
		if w.Code != c.code || !strings.Contains(w.Body.String(), c.body) {
			t.Errorf("err %v → status %d body %s (want %d / %s)", c.err, w.Code, w.Body.String(), c.code, c.body)
		}
	}
}

func TestConfirm_ObjectMissing(t *testing.T) {
	w := do(t, router(&fakeDocSvc{confirmErr: service.ErrObjectMissing}), "POST",
		"/v1/merchant/applications/app-1/documents/doc-123/confirm", "")
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "OBJECT_NOT_FOUND") {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestConfirm_Success(t *testing.T) {
	w := do(t, router(&fakeDocSvc{}), "POST",
		"/v1/merchant/applications/app-1/documents/doc-123/confirm", "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"status":"UPLOADED"`) {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestList_NoStorageKeyLeak(t *testing.T) {
	w := do(t, router(&fakeDocSvc{}), "GET", "/v1/merchant/applications/app-1/documents", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d", w.Code)
	}
	for _, banned := range []string{"storage_key", "storage_bucket", "bucket"} {
		if strings.Contains(w.Body.String(), banned) {
			t.Fatalf("list leaks %q: %s", banned, w.Body.String())
		}
	}
}

func TestAdminReadURL(t *testing.T) {
	w := do(t, router(&fakeDocSvc{}), "POST", "/internal/app-1/documents/doc-123/read-url", "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"read_url":`) {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestAdminAcceptReject(t *testing.T) {
	w := do(t, router(&fakeDocSvc{}), "POST", "/internal/app-1/documents/doc-123/accept", "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "ACCEPTED") {
		t.Fatalf("accept: status=%d body=%s", w.Code, w.Body.String())
	}
	// reject without reason → 400
	w = do(t, router(&fakeDocSvc{}), "POST", "/internal/app-1/documents/doc-123/reject", `{}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("reject without reason: status=%d", w.Code)
	}
	w = do(t, router(&fakeDocSvc{}), "POST", "/internal/app-1/documents/doc-123/reject", `{"reason":"ilegível"}`)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "REJECTED") {
		t.Fatalf("reject: status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestUnavailableWhenServiceNil(t *testing.T) {
	w := do(t, router(nil), "GET", "/v1/merchant/applications/app-1/documents", "")
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("nil service should be 503, got %d", w.Code)
	}
}
