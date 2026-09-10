package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// MerchantDocumentHandler exposes KYB document endpoints (Track 3): the PUBLIC
// applicant flow (request upload URL → confirm → list) and the INTERNAL admin
// flow (list → read-url → accept/reject). Signed URLs are returned to callers
// but NEVER logged. storage_key is never exposed.
type MerchantDocumentHandler struct {
	docs service.MerchantDocumentService
}

func NewMerchantDocumentHandler(docs service.MerchantDocumentService) *MerchantDocumentHandler {
	return &MerchantDocumentHandler{docs: docs}
}

func (h *MerchantDocumentHandler) ready(w http.ResponseWriter, r *http.Request) bool {
	if h.docs == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "onboarding is not available")
		return false
	}
	return true
}

func (h *MerchantDocumentHandler) mapErr(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, service.ErrStorageNotConfigured):
		apierror.Respond(w, r, http.StatusServiceUnavailable, "STORAGE_NOT_CONFIGURED", "document storage is not configured yet")
	case errors.Is(err, service.ErrApplicationNotFound):
		apierror.Respond(w, r, http.StatusNotFound, "APPLICATION_NOT_FOUND", "application not found")
	case errors.Is(err, service.ErrDocumentNotFound):
		apierror.Respond(w, r, http.StatusNotFound, "DOCUMENT_NOT_FOUND", "document not found")
	case errors.Is(err, service.ErrObjectMissing):
		apierror.Respond(w, r, http.StatusConflict, "OBJECT_NOT_FOUND", "uploaded file not found; please retry the upload")
	case errors.Is(err, service.ErrInvalidDocumentType):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_DOCUMENT_TYPE", "unsupported document_type")
	case errors.Is(err, service.ErrInvalidMimeType):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_MIME_TYPE", "only PDF, JPG and PNG are accepted")
	case errors.Is(err, service.ErrInvalidExtension):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_EXTENSION", "file extension must be .pdf, .jpg, .jpeg or .png")
	case errors.Is(err, service.ErrFileTooLarge):
		apierror.Respond(w, r, http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE", "file exceeds the maximum allowed size")
	case errors.Is(err, service.ErrEmptyFile):
		apierror.Respond(w, r, http.StatusBadRequest, "EMPTY_FILE", "file is empty")
	case errors.Is(err, service.ErrContentMismatch):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "CONTENT_MISMATCH", "the file is not a valid PDF, JPEG or PNG of the declared type")
	case errors.Is(err, service.ErrApplicationClosed):
		apierror.Respond(w, r, http.StatusConflict, "APPLICATION_CLOSED", "this application is no longer accepting documents")
	default:
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not process document request")
	}
}

// -------------------------------------------------------------------------
// PUBLIC — applicant flow (no auth; application id is the unguessable token)
// -------------------------------------------------------------------------

// POST /v1/merchant/applications/{id}/documents/upload-url
func (h *MerchantDocumentHandler) RequestUploadURL(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w, r) {
		return
	}
	appID := chi.URLParam(r, "id")
	var body struct {
		DocumentType string `json:"document_type"`
		Filename     string `json:"filename"`
		MimeType     string `json:"mime_type"`
		SizeBytes    int64  `json:"size_bytes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}
	res, err := h.docs.RequestUpload(r.Context(), appID, body.DocumentType, body.Filename, body.MimeType, body.SizeBytes)
	if err != nil {
		h.mapErr(w, r, err)
		return
	}
	// Never log the signed URL — only the document id.
	slog.InfoContext(r.Context(), "merchant.document.upload_url_issued",
		"application_id", appID, "document_id", res.DocumentID, "document_type", body.DocumentType)
	writeJSON(w, http.StatusCreated, map[string]any{
		"document_id": res.DocumentID,
		"upload_url":  res.Upload.URL,
		"method":      res.Upload.Method,
		"headers":     res.Upload.Headers,
		"expires_at":  res.Upload.ExpiresAt,
	})
}

// POST /v1/merchant/applications/{id}/documents/{document_id}/confirm
func (h *MerchantDocumentHandler) ConfirmUpload(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w, r) {
		return
	}
	appID := chi.URLParam(r, "id")
	docID := chi.URLParam(r, "document_id")
	view, err := h.docs.ConfirmUpload(r.Context(), appID, docID)
	if err != nil {
		h.mapErr(w, r, err)
		return
	}
	slog.InfoContext(r.Context(), "merchant.document.confirmed", "application_id", appID, "document_id", docID)
	writeJSON(w, http.StatusOK, view)
}

// GET /v1/merchant/applications/{id}/documents
func (h *MerchantDocumentHandler) ListDocuments(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w, r) {
		return
	}
	appID := chi.URLParam(r, "id")
	list, err := h.docs.ListForApplication(r.Context(), appID)
	if err != nil {
		h.mapErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// -------------------------------------------------------------------------
// INTERNAL — admin flow (guarded by InternalAuth; called only by admin-api)
// -------------------------------------------------------------------------

// GET /internal/v1/merchant-applications/{id}/documents
func (h *MerchantDocumentHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w, r) {
		return
	}
	appID := chi.URLParam(r, "id")
	list, err := h.docs.AdminList(r.Context(), appID)
	if err != nil {
		h.mapErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// POST /internal/v1/merchant-applications/{id}/documents/{document_id}/read-url
func (h *MerchantDocumentHandler) AdminReadURL(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w, r) {
		return
	}
	appID := chi.URLParam(r, "id")
	docID := chi.URLParam(r, "document_id")
	res, err := h.docs.CreateReadURL(r.Context(), appID, docID)
	if err != nil {
		h.mapErr(w, r, err)
		return
	}
	// Log only that a read URL was minted — never the URL itself.
	slog.InfoContext(r.Context(), "merchant.document.read_url_issued", "application_id", appID, "document_id", docID)
	writeJSON(w, http.StatusOK, map[string]any{"read_url": res.URL, "expires_at": res.ExpiresAt})
}

// POST /internal/v1/merchant-applications/{id}/documents/{document_id}/accept
func (h *MerchantDocumentHandler) AdminAccept(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w, r) {
		return
	}
	appID := chi.URLParam(r, "id")
	docID := chi.URLParam(r, "document_id")
	var body struct {
		ReviewedBy string `json:"reviewed_by"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	view, err := h.docs.Accept(r.Context(), appID, docID, body.ReviewedBy)
	if err != nil {
		h.mapErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// POST /internal/v1/merchant-applications/{id}/documents/{document_id}/reject
func (h *MerchantDocumentHandler) AdminReject(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w, r) {
		return
	}
	appID := chi.URLParam(r, "id")
	docID := chi.URLParam(r, "document_id")
	var body struct {
		ReviewedBy string `json:"reviewed_by"`
		Reason     string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Reason == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "reason is required")
		return
	}
	view, err := h.docs.Reject(r.Context(), appID, docID, body.ReviewedBy, body.Reason)
	if err != nil {
		h.mapErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}
