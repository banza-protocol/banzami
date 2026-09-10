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

// VerifyMerchant — POST /v1/compliance/merchants/verify — is refused.
//
// It ran the configured KYB provider for the calling Business and wrote its
// answer as the Business's KYB decision. In the Sandbox that provider is the
// simulated one, which approves any name with a six-character NIF: a Business
// could verify itself. KYB is decided by review — an application approved or
// linked in BANZADMIN, or a completed document review — and nothing a Business
// sends can make that decision.
func (h *ComplianceHandler) VerifyMerchant(w http.ResponseWriter, r *http.Request) {
	apierror.Respond(w, r, http.StatusForbidden, "KYB_DECIDED_BY_REVIEW",
		"a Business's verification is decided by Banzami's review of its application and documents")
}

// KycStatus returns the authenticated consumer's Progressive-KYC status.
// GET /v1/compliance/customers/status
func (h *ComplianceHandler) KycStatus(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.CustomerID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "consumer authentication required")
		return
	}
	data, err := h.svc.GetCustomerStatus(r.Context(), principal.CustomerID)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "STATUS_UNAVAILABLE", "could not fetch KYC status")
		return
	}
	writeRaw(w, http.StatusOK, data)
}

// MerchantStatus returns the authenticated merchant's KYB + AML status, so the
// Business app can show the real verification state (read-only).
// GET /v1/compliance/merchants/status
func (h *ComplianceHandler) MerchantStatus(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant authentication required")
		return
	}
	status, err := h.svc.GetMerchantStatus(r.Context(), principal.MerchantID)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "STATUS_UNAVAILABLE", "could not fetch KYB status")
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func writeRaw(w http.ResponseWriter, status int, data []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(data)
}
