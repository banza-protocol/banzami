package handler

import (
	"io"
	"net/http"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type ComplianceHandler struct {
	svc service.ComplianceService
}

func NewComplianceHandler(svc service.ComplianceService) *ComplianceHandler {
	return &ComplianceHandler{svc: svc}
}

// VerifyCustomer runs a consumer KYC verification for the authenticated consumer.
// POST /v1/compliance/customers/verify
// Body: {full_name, document_type, document_number, date_of_birth, requested_level}
func (h *ComplianceHandler) VerifyCustomer(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.CustomerID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "consumer authentication required")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "could not read request body")
		return
	}
	data, err := h.svc.VerifyCustomer(r.Context(), principal.CustomerID, body)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "VERIFICATION_FAILED", "identity verification failed")
		return
	}
	writeRaw(w, http.StatusOK, data)
}

// VerifyMerchant runs a merchant KYB verification for the authenticated merchant.
// POST /v1/compliance/merchants/verify
// Body: {legal_name, tax_id, representative_name}
func (h *ComplianceHandler) VerifyMerchant(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant authentication required")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "could not read request body")
		return
	}
	data, err := h.svc.VerifyMerchant(r.Context(), principal.MerchantID, body)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "VERIFICATION_FAILED", "identity verification failed")
		return
	}
	writeRaw(w, http.StatusOK, data)
}

func writeRaw(w http.ResponseWriter, status int, data []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(data)
}
