package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
	documents "github.com/banzami/banzami/services/common/documents"
)

type fakeSrc struct {
	data documents.ReceiptData
	err  error
}

func (f *fakeSrc) LoadReceipt(context.Context, string) (documents.ReceiptData, error) {
	return f.data, f.err
}

func docReq(id string) (*httptest.ResponseRecorder, *http.Request) {
	req := httptest.NewRequest(http.MethodGet, "/admin/v1/transactions/x/receipt.pdf", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	return httptest.NewRecorder(), req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

func stubGen() pdfGenerator {
	return func(context.Context, documents.ReceiptData) ([]byte, error) { return []byte("%PDF-1.4 x"), nil }
}

func TestTransactionReceipt_OK(t *testing.T) {
	h := &DocumentHandler{src: &fakeSrc{data: documents.SampleData()}, gen: stubGen()}
	w, r := docReq("BZM-7F3A-92K1")
	h.TransactionReceipt(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if w.Header().Get("Content-Type") != "application/pdf" {
		t.Errorf("content-type = %q", w.Header().Get("Content-Type"))
	}
	if !strings.Contains(w.Header().Get("Content-Disposition"), "banzami-comprovativo-") {
		t.Errorf("disposition = %q", w.Header().Get("Content-Disposition"))
	}
}

func TestTransactionReceipt_NotFound404(t *testing.T) {
	h := &DocumentHandler{src: &fakeSrc{err: service.ErrReceiptNotFound}, gen: stubGen()}
	w, r := docReq("missing")
	h.TransactionReceipt(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestTransactionReceipt_GenFail503(t *testing.T) {
	failGen := pdfGenerator(func(context.Context, documents.ReceiptData) ([]byte, error) {
		return nil, context.DeadlineExceeded
	})
	h := &DocumentHandler{src: &fakeSrc{data: documents.SampleData()}, gen: failGen}
	w, r := docReq("x")
	h.TransactionReceipt(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
}

func TestTransactionReceipt_NilSource503(t *testing.T) {
	h := &DocumentHandler{src: nil, gen: stubGen()}
	w, r := docReq("x")
	h.TransactionReceipt(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
}
