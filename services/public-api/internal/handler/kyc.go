package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// KycHandler is the consumer-facing surface for identity verification (ADR-020).
// It never returns a storage_key or signed URL beyond the single short-lived
// upload URL, never accepts a `requested_level` (the operator decides the
// level), and never logs PII / storage keys / signed URLs.
type KycHandler struct {
	kyc *service.KycService
}

func NewKycHandler(kyc *service.KycService) *KycHandler {
	return &KycHandler{kyc: kyc}
}

// ── DTOs ────────────────────────────────────────────────────────────────────

type createCaseRequest struct {
	DocumentType string `json:"document_type"`
	Country      string `json:"country,omitempty"`
	// NOTE: no `requested_level` — the consumer never picks the KYC level.
}

type uploadURLRequest struct {
	EvidenceType string `json:"evidence_type"` // DOCUMENT_IMAGE | SELFIE
	Side         string `json:"side,omitempty"` // FRONT | BACK | MAIN_PAGE | SELFIE
	ContentType  string `json:"content_type,omitempty"`
}

type completeEvidenceRequest struct {
	EvidenceID string `json:"evidence_id"`
	SHA256     string `json:"sha256,omitempty"`
}

type requiredEvidenceDTO struct {
	EvidenceType string `json:"evidence_type"`
	Side         string `json:"side,omitempty"`
	Slot         string `json:"slot"`
	Uploaded     bool   `json:"uploaded"`
}

type evidenceDTO struct {
	ID           string `json:"id"`
	EvidenceType string `json:"evidence_type"`
	Side         string `json:"side,omitempty"`
	Slot         string `json:"slot"`
	Status       string `json:"status"`
	UploadedAt   string `json:"uploaded_at,omitempty"`
}

type caseDTO struct {
	ID               string                `json:"id"`
	Status           string                `json:"status"`
	DocumentType     string                `json:"document_type,omitempty"`
	Country          string                `json:"country,omitempty"`
	ReasonCode       string                `json:"reason_code,omitempty"`
	Environment      string                `json:"environment"`
	CreatedAt        string                `json:"created_at"`
	SubmittedAt      string                `json:"submitted_at,omitempty"`
	ReviewedAt       string                `json:"reviewed_at,omitempty"`
	RequiredEvidence []requiredEvidenceDTO `json:"required_evidence"`
	Evidence         []evidenceDTO         `json:"evidence"`
}

// ── Handlers ─────────────────────────────────────────────────────────────────

// POST /v1/kyc/cases
func (h *KycHandler) CreateCase(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}
	var req createCaseRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}
	c, err := h.kyc.CreateOrResumeCase(r.Context(), consumer.ID, req.DocumentType, req.Country, r.Header.Get("Idempotency-Key"))
	if err != nil {
		h.fail(w, r, "create_case", consumer.ID, err)
		return
	}
	h.respondCase(w, r, consumer.ID, c, http.StatusCreated)
}

// GET /v1/kyc/cases/current
func (h *KycHandler) GetCurrent(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}
	c, err := h.kyc.GetCurrentCase(r.Context(), consumer.ID)
	if err != nil {
		h.fail(w, r, "get_current", consumer.ID, err)
		return
	}
	h.respondCase(w, r, consumer.ID, c, http.StatusOK)
}

// GET /v1/kyc/cases/{id}  and  GET /v1/kyc/cases/{id}/status
func (h *KycHandler) GetCase(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}
	c, err := h.kyc.GetCase(r.Context(), consumer.ID, chi.URLParam(r, "id"))
	if err != nil {
		h.fail(w, r, "get_case", consumer.ID, err)
		return
	}
	h.respondCase(w, r, consumer.ID, c, http.StatusOK)
}

// POST /v1/kyc/cases/{id}/evidence/upload-url
func (h *KycHandler) RequestUploadURL(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}
	var req uploadURLRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}
	caseID := chi.URLParam(r, "id")
	evidenceID, up, err := h.kyc.RequestUploadURL(r.Context(), consumer.ID, caseID, req.EvidenceType, req.Side, req.ContentType)
	if err != nil {
		h.fail(w, r, "upload_url", consumer.ID, err)
		return
	}
	slog.Info("kyc evidence upload url issued", "case_id", caseID, "evidence_id", evidenceID, "evidence_type", req.EvidenceType)
	respond(w, http.StatusOK, map[string]any{
		"evidence_id": evidenceID,
		"upload_url":  up.URL, // short-lived signed PUT; never logged
		"method":      up.Method,
		"headers":     up.Headers,
		"expires_at":  up.ExpiresAt.UTC().Format(time.RFC3339),
	})
}

// POST /v1/kyc/cases/{id}/evidence/complete
func (h *KycHandler) CompleteEvidence(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}
	var req completeEvidenceRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}
	caseID := chi.URLParam(r, "id")
	c, err := h.kyc.CompleteEvidence(r.Context(), consumer.ID, caseID, req.EvidenceID, req.SHA256)
	if err != nil {
		h.fail(w, r, "complete_evidence", consumer.ID, err)
		return
	}
	slog.Info("kyc evidence completed", "case_id", caseID, "evidence_id", req.EvidenceID, "case_status", c.Status)
	h.respondCase(w, r, consumer.ID, c, http.StatusOK)
}

// POST /v1/kyc/cases/{id}/submit
func (h *KycHandler) Submit(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}
	caseID := chi.URLParam(r, "id")
	c, err := h.kyc.SubmitCase(r.Context(), consumer.ID, caseID)
	if err != nil {
		h.fail(w, r, "submit", consumer.ID, err)
		return
	}
	slog.Info("kyc case submitted", "case_id", caseID, "case_status", c.Status)
	h.respondCase(w, r, consumer.ID, c, http.StatusOK)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func (h *KycHandler) respondCase(w http.ResponseWriter, r *http.Request, consumerID string, c *service.KycCase, status int) {
	items, err := h.kyc.ListEvidence(r.Context(), c.ID)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not load case")
		return
	}
	uploaded := map[string]bool{}
	evDTOs := make([]evidenceDTO, 0, len(items))
	for _, it := range items {
		if it.Status == "UPLOADED" {
			uploaded[it.Slot] = true
		}
		var up string
		if it.UploadedAt != nil {
			up = it.UploadedAt.UTC().Format(time.RFC3339)
		}
		evDTOs = append(evDTOs, evidenceDTO{
			ID: it.ID, EvidenceType: it.EvidenceType, Side: it.Side,
			Slot: it.Slot, Status: it.Status, UploadedAt: up,
		})
	}

	req := make([]requiredEvidenceDTO, 0, 3)
	for _, rs := range service.RequiredEvidenceFor(c.DocumentType) {
		req = append(req, requiredEvidenceDTO{
			EvidenceType: rs.EvidenceType, Side: rs.Side, Slot: rs.Slot, Uploaded: uploaded[rs.Slot],
		})
	}

	respond(w, status, caseDTO{
		ID:               c.ID,
		Status:           c.Status,
		DocumentType:     c.DocumentType,
		Country:          c.Country,
		ReasonCode:       c.ReasonCode,
		Environment:      c.Environment,
		CreatedAt:        c.CreatedAt.UTC().Format(time.RFC3339),
		SubmittedAt:      formatPtr(c.SubmittedAt),
		ReviewedAt:       formatPtr(c.ReviewedAt),
		RequiredEvidence: req,
		Evidence:         evDTOs,
	})
}

func formatPtr(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

// fail maps a service error to an HTTP response. It logs only non-PII context.
func (h *KycHandler) fail(w http.ResponseWriter, r *http.Request, op, consumerID string, err error) {
	switch {
	case errors.Is(err, service.ErrKycCaseNotFound):
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "kyc case not found")
	case errors.Is(err, service.ErrKycStorageNotConfigured):
		apierror.Respond(w, r, http.StatusServiceUnavailable, "STORAGE_NOT_CONFIGURED", "identity verification is temporarily unavailable")
	case errors.Is(err, service.ErrKycInvalidInput):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_INPUT", err.Error())
	case errors.Is(err, service.ErrKycInvalidState):
		apierror.Respond(w, r, http.StatusConflict, "INVALID_STATE", "the case is not in a valid state for this action")
	case errors.Is(err, service.ErrKycEvidenceMissing):
		apierror.Respond(w, r, http.StatusConflict, "EVIDENCE_INCOMPLETE", "required evidence is missing")
	case errors.Is(err, service.ErrKycObjectNotUploaded):
		apierror.Respond(w, r, http.StatusConflict, "OBJECT_NOT_UPLOADED", "the file was not uploaded")
	default:
		slog.Error("kyc operation failed", "op", op, "error", err)
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not process the request")
	}
}
