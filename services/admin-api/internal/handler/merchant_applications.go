package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// GatewayApplications is the subset of the gateway client the admin handler uses.
type GatewayApplications interface {
	ListApplicationsRaw(ctx context.Context, status, environment string) (json.RawMessage, int, error)
	GetApplicationRaw(ctx context.Context, id string) (json.RawMessage, int, error)
	ApproveApplication(ctx context.Context, id, reviewedBy string) (service.ApprovalResult, int, error)
	RejectApplication(ctx context.Context, id, reviewedBy, adminNotes, merchantMessage string) (service.RejectionResult, int, error)
	// KYB documents (Track 3) — raw passthrough (status + body forwarded).
	ListApplicationDocumentsRaw(ctx context.Context, id string) (json.RawMessage, int, error)
	CreateDocumentReadURLRaw(ctx context.Context, id, documentID string) (json.RawMessage, int, error)
	AcceptDocumentRaw(ctx context.Context, id, documentID, reviewedBy string) (json.RawMessage, int, error)
	RejectDocumentRaw(ctx context.Context, id, documentID, reviewedBy, reason string) (json.RawMessage, int, error)
}

// ApplicationMailer is the subset of the email sender the admin handler uses.
type ApplicationMailer interface {
	MerchantApplicationApproved(to, businessName, handle, environment, activationURL string)
	MerchantApplicationRejected(to, businessName, message, environment string)
}

// PlatformModeReader reads the global Platform Status (SANDBOX/LIVE). Business
// emails communicate the PLATFORM environment, never the application's own field.
type PlatformModeReader interface {
	GetMode(ctx context.Context) service.PlatformMode
}

// MerchantApplicationHandler exposes the admin-authed application endpoints. It
// orchestrates: gateway (data + provisioning) + email. The raw activation token
// is used ONLY to build the email link and is never returned to the admin UI.
type MerchantApplicationHandler struct {
	gw             GatewayApplications
	mailer         ApplicationMailer
	websiteBaseURL string
	platform       PlatformModeReader
}

func NewMerchantApplicationHandler(gw GatewayApplications, mailer ApplicationMailer, websiteBaseURL string, platform PlatformModeReader) *MerchantApplicationHandler {
	return &MerchantApplicationHandler{gw: gw, mailer: mailer, websiteBaseURL: websiteBaseURL, platform: platform}
}

// platformEnv returns the global platform environment for emails. Fail-safe: any
// failure to read it resolves to SANDBOX — never communicate production on error.
func (h *MerchantApplicationHandler) platformEnv(ctx context.Context) string {
	if h.platform == nil {
		return "SANDBOX"
	}
	m := h.platform.GetMode(ctx)
	if m.Mode == "LIVE" {
		return "LIVE"
	}
	return "SANDBOX"
}

func writeRaw(w http.ResponseWriter, code int, raw json.RawMessage) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if len(raw) == 0 {
		_, _ = w.Write([]byte("{}"))
		return
	}
	_, _ = w.Write(raw)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (h *MerchantApplicationHandler) List(w http.ResponseWriter, r *http.Request) {
	raw, code, err := h.gw.ListApplicationsRaw(r.Context(), r.URL.Query().Get("status"), r.URL.Query().Get("environment"))
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not list applications")
		return
	}
	writeRaw(w, code, raw)
}

func (h *MerchantApplicationHandler) Get(w http.ResponseWriter, r *http.Request) {
	raw, code, err := h.gw.GetApplicationRaw(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, code, "could not load application")
		return
	}
	writeRaw(w, code, raw)
}

func (h *MerchantApplicationHandler) Approve(w http.ResponseWriter, r *http.Request) {
	// Attribution comes from the authenticated operator, never the client.
	res, code, err := h.gw.ApproveApplication(r.Context(), chi.URLParam(r, "id"), actorOf(r))
	if err != nil {
		writeErr(w, code, "could not approve application")
		return
	}

	// Build the activation link and email it. The token is never returned to the
	// admin UI nor logged.
	activationURL := h.websiteBaseURL + "/comerciantes/activar?token=" + res.ActivationToken
	// The email communicates the GLOBAL platform environment (Platform Status),
	// never the application's own field — so a SANDBOX platform never says "Produção".
	h.mailer.MerchantApplicationApproved(res.Email, res.BusinessName, res.Handle, h.platformEnv(r.Context()), activationURL)

	// Audit (no token, no full API key — prefix/handle/merchant id are safe).
	auditAfter(r, "merchant_application", chi.URLParam(r, "id"), map[string]any{
		"status":        "APPROVED",
		"merchant_id":   res.MerchantID,
		"handle":        res.Handle,
		"email_sent_to": res.Email,
	})

	writeRaw(w, http.StatusOK, mustJSON(map[string]any{
		"status":         "APPROVED",
		"merchant_id":    res.MerchantID,
		"handle":         res.Handle,
		"api_key_prefix": res.ApiKeyPrefix,
		"email_sent_to":  res.Email,
	}))
}

func (h *MerchantApplicationHandler) Reject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AdminNotes      string `json:"admin_notes"`
		MerchantMessage string `json:"merchant_message"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	res, code, err := h.gw.RejectApplication(r.Context(), chi.URLParam(r, "id"), actorOf(r), body.AdminNotes, body.MerchantMessage)
	if err != nil {
		writeErr(w, code, "could not reject application")
		return
	}

	h.mailer.MerchantApplicationRejected(res.Email, res.BusinessName, res.MerchantMessage, h.platformEnv(r.Context()))

	auditAfter(r, "merchant_application", chi.URLParam(r, "id"), map[string]any{
		"status":           "REJECTED",
		"admin_notes":      body.AdminNotes,
		"merchant_message": res.MerchantMessage,
		"email_sent_to":    res.Email,
	})

	writeRaw(w, http.StatusOK, mustJSON(map[string]any{
		"status":        "REJECTED",
		"email_sent_to": res.Email,
	}))
}

// -------------------------------------------------------------------------
// KYB documents (Track 3) — admin review. Everything is proxied to the gateway
// /internal endpoints; the gateway owns DB + storage. Read URLs pass through to
// the UI and are never logged here.
// -------------------------------------------------------------------------

func (h *MerchantApplicationHandler) ListDocuments(w http.ResponseWriter, r *http.Request) {
	raw, code, err := h.gw.ListApplicationDocumentsRaw(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not list documents")
		return
	}
	writeRaw(w, code, raw)
}

func (h *MerchantApplicationHandler) DocumentReadURL(w http.ResponseWriter, r *http.Request) {
	raw, code, err := h.gw.CreateDocumentReadURLRaw(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "documentId"))
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not create read url")
		return
	}
	writeRaw(w, code, raw)
}

func (h *MerchantApplicationHandler) AcceptDocument(w http.ResponseWriter, r *http.Request) {
	raw, code, err := h.gw.AcceptDocumentRaw(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "documentId"), actorOf(r))
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not accept document")
		return
	}
	auditAfter(r, "kyb_document", chi.URLParam(r, "documentId"), map[string]any{
		"application_id": chi.URLParam(r, "id"),
		"document_id":    chi.URLParam(r, "documentId"),
		"status":         "ACCEPTED",
	})
	writeRaw(w, code, raw)
}

func (h *MerchantApplicationHandler) RejectDocument(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Reason == "" {
		writeErr(w, http.StatusBadRequest, "reason is required")
		return
	}
	raw, code, err := h.gw.RejectDocumentRaw(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "documentId"), actorOf(r), body.Reason)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not reject document")
		return
	}
	auditAfter(r, "kyb_document", chi.URLParam(r, "documentId"), map[string]any{
		"application_id": chi.URLParam(r, "id"),
		"document_id":    chi.URLParam(r, "documentId"),
		"status":         "REJECTED",
		"reason":         body.Reason,
	})
	writeRaw(w, code, raw)
}

func mustJSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
