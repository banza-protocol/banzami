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
	gw *service.GatewayClient
}

func NewMerchantKybHandler(gw *service.GatewayClient) *MerchantKybHandler {
	return &MerchantKybHandler{gw: gw}
}

// GET /admin/v1/merchant-kyb/documents?status=&limit=
func (h *MerchantKybHandler) List(w http.ResponseWriter, r *http.Request) {
	raw, code, err := h.gw.ListMerchantKybDocumentsRaw(r.Context(),
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
	id := chi.URLParam(r, "id")
	raw, code, err := h.gw.ApproveMerchantKybDocumentRaw(r.Context(), id, actorOf(r), body.ValidUntil)
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
	id := chi.URLParam(r, "id")
	raw, code, err := h.gw.RejectMerchantKybDocumentRaw(r.Context(), id, actorOf(r), body.RejectionReason)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not reject document")
		return
	}
	auditAfter(r, "merchant_kyb_document", id, map[string]any{"decision": "REJECTED", "reason": body.RejectionReason})
	writeRaw(w, code, raw)
}
