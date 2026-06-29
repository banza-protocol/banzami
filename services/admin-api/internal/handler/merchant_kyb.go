package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

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

// POST /admin/v1/merchant-kyb/documents/{id}/approve   {valid_until?}
func (h *MerchantKybHandler) Approve(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ValidUntil string `json:"valid_until"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	gw, ok := h.pick(r)
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, "sandbox review is not configured")
		return
	}
	id := chi.URLParam(r, "id")
	raw, code, err := gw.ApproveMerchantKybDocumentRaw(r.Context(), id, actorOf(r), body.ValidUntil)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not approve document")
		return
	}
	auditAfter(r, "merchant_kyb_document", id, map[string]any{"decision": "VALID", "valid_until": body.ValidUntil})
	writeRaw(w, code, raw)
}

// POST /admin/v1/merchant-kyb/documents/{id}/reject   {rejection_reason}
func (h *MerchantKybHandler) Reject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RejectionReason string `json:"rejection_reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	gw, ok := h.pick(r)
	if !ok {
		writeErr(w, http.StatusServiceUnavailable, "sandbox review is not configured")
		return
	}
	id := chi.URLParam(r, "id")
	raw, code, err := gw.RejectMerchantKybDocumentRaw(r.Context(), id, actorOf(r), body.RejectionReason)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not reject document")
		return
	}
	auditAfter(r, "merchant_kyb_document", id, map[string]any{"decision": "REJECTED", "reason": body.RejectionReason})
	writeRaw(w, code, raw)
}
