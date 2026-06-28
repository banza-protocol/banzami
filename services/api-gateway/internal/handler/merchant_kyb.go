package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// MerchantKybHandler is the merchant-authenticated KYB document surface + the
// internal admin review surface. It never returns a storage_key and never logs
// signed URLs or PII.
type MerchantKybHandler struct {
	svc *service.PostgresMerchantKybService
}

func NewMerchantKybHandler(svc *service.PostgresMerchantKybService) *MerchantKybHandler {
	return &MerchantKybHandler{svc: svc}
}

func (h *MerchantKybHandler) unavailable(w http.ResponseWriter, r *http.Request) bool {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "kyb is not available")
		return true
	}
	return false
}

// ── Merchant surface ─────────────────────────────────────────────────────────

// GET /v1/merchant/kyb/status
func (h *MerchantKybHandler) Status(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}
	mid, ok := h.merchant(w, r)
	if !ok {
		return
	}
	st, err := h.svc.GetStatus(r.Context(), mid)
	if err != nil {
		h.fail(w, r, "status", err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

// GET /v1/merchant/kyb/documents
func (h *MerchantKybHandler) ListDocuments(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}
	mid, ok := h.merchant(w, r)
	if !ok {
		return
	}
	docs, err := h.svc.ListDocuments(r.Context(), mid)
	if err != nil {
		h.fail(w, r, "list", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"documents": docs})
}

// GET /v1/merchant/kyb/documents/{id}
func (h *MerchantKybHandler) GetDocument(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}
	mid, ok := h.merchant(w, r)
	if !ok {
		return
	}
	doc, err := h.svc.GetDocument(r.Context(), mid, chi.URLParam(r, "id"))
	if err != nil {
		h.fail(w, r, "get", err)
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

// POST /v1/merchant/kyb/documents/{id}/upload-url   ({id} = document_type)
func (h *MerchantKybHandler) RequestUploadURL(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant authentication required")
		return
	}
	var body struct {
		ContentType string `json:"content_type"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body)
	docType := chi.URLParam(r, "id")
	docID, up, err := h.svc.RequestUploadURL(r.Context(), principal.MerchantID, principal.Environment, docType, body.ContentType)
	if err != nil {
		h.fail(w, r, "upload_url", err)
		return
	}
	slog.Info("merchant kyb upload url issued", "merchant_id", principal.MerchantID, "document_id", docID, "document_type", docType)
	writeJSON(w, http.StatusOK, map[string]any{
		"document_id": docID,
		"upload_url":  up.URL, // short-lived signed PUT; never logged
		"method":      up.Method,
		"headers":     up.Headers,
		"expires_at":  up.ExpiresAt.UTC().Format(time.RFC3339),
	})
}

// POST /v1/merchant/kyb/documents/{id}/complete
func (h *MerchantKybHandler) CompleteUpload(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}
	mid, ok := h.merchant(w, r)
	if !ok {
		return
	}
	var body struct {
		SHA256 string `json:"sha256"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body)
	docID := chi.URLParam(r, "id")
	doc, err := h.svc.CompleteUpload(r.Context(), mid, docID, body.SHA256)
	if err != nil {
		h.fail(w, r, "complete", err)
		return
	}
	slog.Info("merchant kyb document completed", "merchant_id", mid, "document_id", docID, "status", doc.Status)
	writeJSON(w, http.StatusOK, doc)
}

// ── Internal admin surface ───────────────────────────────────────────────────

// GET /internal/v1/merchant-kyb/documents?status=&limit=
func (h *MerchantKybHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	docs, err := h.svc.AdminList(r.Context(), r.URL.Query().Get("status"), limit)
	if err != nil {
		h.fail(w, r, "admin_list", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"documents": docs})
}

// POST /internal/v1/merchant-kyb/documents/{id}/approve   {valid_until?}
func (h *MerchantKybHandler) AdminApprove(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}
	var body struct {
		ValidUntil string `json:"valid_until"`
		Actor      string `json:"actor"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body)
	var validUntil *time.Time
	if body.ValidUntil != "" {
		if t, perr := time.Parse(time.RFC3339, body.ValidUntil); perr == nil {
			validUntil = &t
		}
	}
	if err := h.svc.AdminApprove(r.Context(), chi.URLParam(r, "id"), body.Actor, validUntil); err != nil {
		h.fail(w, r, "admin_approve", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "VALID"})
}

// POST /internal/v1/merchant-kyb/documents/{id}/reject   {rejection_reason}
func (h *MerchantKybHandler) AdminReject(w http.ResponseWriter, r *http.Request) {
	if h.unavailable(w, r) {
		return
	}
	var body struct {
		RejectionReason string `json:"rejection_reason"`
		Actor           string `json:"actor"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body)
	if err := h.svc.AdminReject(r.Context(), chi.URLParam(r, "id"), body.Actor, body.RejectionReason); err != nil {
		h.fail(w, r, "admin_reject", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "REJECTED"})
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func (h *MerchantKybHandler) merchant(w http.ResponseWriter, r *http.Request) (string, bool) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant authentication required")
		return "", false
	}
	return principal.MerchantID, true
}

func (h *MerchantKybHandler) fail(w http.ResponseWriter, r *http.Request, op string, err error) {
	switch {
	case errors.Is(err, service.ErrKybDocNotFound):
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "document not found")
	case errors.Is(err, service.ErrKybStorageDisabled):
		apierror.Respond(w, r, http.StatusServiceUnavailable, "STORAGE_NOT_CONFIGURED", "document storage is not configured")
	case errors.Is(err, service.ErrKybInvalidType):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_DOCUMENT_TYPE", "unsupported document_type")
	case errors.Is(err, service.ErrKybInvalidMime):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_MIME_TYPE", "only PDF, JPG and PNG are accepted")
	case errors.Is(err, service.ErrKybObjectNotUploaded):
		apierror.Respond(w, r, http.StatusConflict, "OBJECT_NOT_UPLOADED", "the file was not uploaded")
	case errors.Is(err, service.ErrKybReasonRequired):
		apierror.Respond(w, r, http.StatusBadRequest, "REASON_REQUIRED", "rejection_reason is required")
	case errors.Is(err, service.ErrKybInvalidState):
		apierror.Respond(w, r, http.StatusConflict, "INVALID_STATE", "the document is not in a valid state for this action")
	default:
		slog.Error("merchant kyb operation failed", "op", op, "error", err)
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not process the request")
	}
}
