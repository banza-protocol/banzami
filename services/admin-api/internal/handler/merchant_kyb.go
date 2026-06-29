package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// MerchantKybHandler is the admin review surface for post-approval merchant KYB
// documents. It proxies to the gateway internal endpoints (which own the data +
// signed download URLs). storage_key is never exposed.
type MerchantKybHandler struct {
	gw        *service.GatewayClient // live gateway
	gwSandbox *service.GatewayClient // staging gateway (optional)
}

func NewMerchantKybHandler(gw, gwSandbox *service.GatewayClient) *MerchantKybHandler {
	return &MerchantKybHandler{gw: gw, gwSandbox: gwSandbox}
}

// pick returns the gateway client for the requested environment. SANDBOX routes
// to the staging gateway (operator-only review of sandbox docs); when sandbox is
// requested but not configured it returns nil so the handler can 503.
func (h *MerchantKybHandler) pick(r *http.Request) (*service.GatewayClient, bool) {
	if r.URL.Query().Get("environment") == "SANDBOX" {
		return h.gwSandbox, h.gwSandbox != nil
	}
	return h.gw, true
}

// GET /admin/v1/merchant-kyb/documents?status=&limit=
func (h *MerchantKybHandler) List(w http.ResponseWriter, r *http.Request) {
	gw, ok := h.pick(r)
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, "sandbox review is not configured")
		return
	}
	raw, code, err := gw.ListMerchantKybDocumentsRaw(r.Context(),
		r.URL.Query().Get("status"), r.URL.Query().Get("limit"))
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not list KYB documents")
		return
	}
	writeRaw(w, code, raw)
}

// GET /admin/v1/merchant-kyb/merchants?limit=   — merchant-centric review queue.
func (h *MerchantKybHandler) Merchants(w http.ResponseWriter, r *http.Request) {
	gw, ok := h.pick(r)
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, "sandbox review is not configured")
		return
	}
	raw, code, err := gw.ListMerchantKybMerchantsRaw(r.Context(), r.URL.Query().Get("limit"))
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not list merchants")
		return
	}
	writeRaw(w, code, raw)
}

// GET /admin/v1/merchant-kyb/merchants/{id}/documents
func (h *MerchantKybHandler) MerchantDocuments(w http.ResponseWriter, r *http.Request) {
	gw, ok := h.pick(r)
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, "sandbox review is not configured")
		return
	}
	raw, code, err := gw.MerchantKybMerchantDocumentsRaw(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not list merchant documents")
		return
	}
	writeRaw(w, code, raw)
}

// POST /admin/v1/merchant-kyb/documents/{id}/approve   {valid_until?, notes?}
func (h *MerchantKybHandler) Approve(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ValidUntil string `json:"valid_until"`
		Notes      string `json:"notes"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body)
	gw, ok := h.pick(r)
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, "sandbox review is not configured")
		return
	}
	id := chi.URLParam(r, "id")
	raw, code, err := gw.ApproveMerchantKybDocumentRaw(r.Context(), id, actorOf(r), body.ValidUntil, body.Notes)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not approve document")
		return
	}
	// Internal notes are operator-only; never echoed to the merchant. The audit row
	// keeps decision + validity; notes stay in the gateway event payload/metadata.
	auditDecision(r, "APPROVE_DOCUMENT", id, map[string]any{"decision": "VALID", "valid_until": body.ValidUntil})
	writeRaw(w, code, raw)
}

// POST /admin/v1/merchant-kyb/documents/{id}/reject   {rejection_reason, notes?}
func (h *MerchantKybHandler) Reject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RejectionReason string `json:"rejection_reason"`
		Notes           string `json:"notes"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body)
	gw, ok := h.pick(r)
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, "sandbox review is not configured")
		return
	}
	id := chi.URLParam(r, "id")
	raw, code, err := gw.RejectMerchantKybDocumentRaw(r.Context(), id, actorOf(r), body.RejectionReason, body.Notes)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not reject document")
		return
	}
	// The rejection_reason is merchant-facing (consumed by the Business app); notes
	// are operator-only.
	auditDecision(r, "REJECT_DOCUMENT", id, map[string]any{"decision": "REJECTED", "reason": body.RejectionReason})
	writeRaw(w, code, raw)
}

// GET /admin/v1/merchant-kyb/merchants/{id}/context
func (h *MerchantKybHandler) Context(w http.ResponseWriter, r *http.Request) {
	gw, ok := h.pick(r)
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, "sandbox review is not configured")
		return
	}
	raw, code, err := gw.MerchantKybContextRaw(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not load merchant context")
		return
	}
	writeRaw(w, code, raw)
}

// GET /admin/v1/merchant-kyb/merchants/{id}/timeline
func (h *MerchantKybHandler) Timeline(w http.ResponseWriter, r *http.Request) {
	gw, ok := h.pick(r)
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, "sandbox review is not configured")
		return
	}
	raw, code, err := gw.MerchantKybTimelineRaw(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not load KYB timeline")
		return
	}
	writeRaw(w, code, raw)
}

// POST /admin/v1/merchant-kyb/documents/{id}/read-url   {intent?: view|download|copy}
//
// Mints a short-TTL signed GET on demand. The signed URL is returned to the
// operator and audited as an access event (VIEW/DOWNLOAD/COPY) but NEVER stored:
// not in the audit row, not anywhere. storage_key is never exposed.
func (h *MerchantKybHandler) ReadURL(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Intent string `json:"intent"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body)
	gw, ok := h.pick(r)
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, "sandbox review is not configured")
		return
	}
	id := chi.URLParam(r, "id")
	raw, code, err := gw.MerchantKybReadURLRaw(r.Context(), id)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not mint download url")
		return
	}
	if code == http.StatusOK {
		auditDecision(r, accessAction(body.Intent), id, map[string]any{"access": accessAction(body.Intent)})
	}
	writeRaw(w, code, raw)
}

// accessAction maps a UI intent to the canonical audit action for document access.
// Defaults to VIEW_DOCUMENT for any unknown/empty intent.
func accessAction(intent string) string {
	switch intent {
	case "download":
		return "DOWNLOAD_DOCUMENT"
	case "copy":
		return "COPY_SIGNED_URL"
	default:
		return "VIEW_DOCUMENT"
	}
}

// auditDecision records an explicit action name plus an after-only payload. The
// signed URL is deliberately omitted from `after`.
func auditDecision(r *http.Request, action, id string, after map[string]any) {
	auditAnnotate(r, func(a *auth.AuditAnnotation) {
		a.Action = action
		a.EntityType = "merchant_kyb_document"
		a.EntityID = id
		a.After = after
	})
}
