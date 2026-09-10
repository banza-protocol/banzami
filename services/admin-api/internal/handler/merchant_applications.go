package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

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
	// Lifecycle passthrough — the gateway's status and body, verbatim.
	ApproveApplicationRaw(ctx context.Context, id, reviewedBy string) (json.RawMessage, int, error)
	RejectApplicationRaw(ctx context.Context, id, reviewedBy, adminNotes, merchantMessage string) (json.RawMessage, int, error)
	StartApplicationReviewRaw(ctx context.Context, id, reviewedBy string) (json.RawMessage, int, error)
	LinkApplicationRaw(ctx context.Context, id, merchantID, confirmationHandle, reviewedBy, reason string) (json.RawMessage, int, error)
	RequestApplicationInformationRaw(ctx context.Context, id, reviewedBy, message string) (json.RawMessage, int, error)
	ReissueActivationRaw(ctx context.Context, id string) (json.RawMessage, int, error)
	LinkCandidatesRaw(ctx context.Context, id, handle string) (json.RawMessage, int, error)
	ApplicationBusinessStateRaw(ctx context.Context, id string) (json.RawMessage, int, error)
	BusinessStateRaw(ctx context.Context, merchantID string) (json.RawMessage, int, error)
	ResetBusinessAppPinRaw(ctx context.Context, merchantID string) (json.RawMessage, int, error)
}

// ApplicationMailer is the subset of the email sender the admin handler uses.
type ApplicationMailer interface {
	MerchantApplicationApproved(to, businessName, handle, environment, activationURL string)
	MerchantApplicationRejected(to, businessName, message, environment string)
	MerchantInformationRequested(to, request, statusURL, environment string)
	MerchantAppPinReset(to, handle, environment, resetURL string)
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
	gwStaging      GatewayApplications // SANDBOX stack (banzami_staging); nil when unconfigured
	mailer         ApplicationMailer
	websiteBaseURL string
	platform       PlatformModeReader
}

func NewMerchantApplicationHandler(gw, gwStaging GatewayApplications, mailer ApplicationMailer, websiteBaseURL string, platform PlatformModeReader) *MerchantApplicationHandler {
	return &MerchantApplicationHandler{gw: gw, gwStaging: gwStaging, mailer: mailer, websiteBaseURL: websiteBaseURL, platform: platform}
}

// gatewayFor selects the stack for an environment-qualified request (ADR-025):
// SANDBOX → staging gateway (banzami_staging) when configured; otherwise live.
func (h *MerchantApplicationHandler) gatewayFor(environment string) GatewayApplications {
	if h.gwStaging != nil && strings.EqualFold(strings.TrimSpace(environment), "SANDBOX") {
		return h.gwStaging
	}
	return h.gw
}

// gatewayForRequest picks the stack for a request that may not have said which.
//
// An unqualified call used to fall through to the live stack unconditionally.
// While the platform is SANDBOX that stack is not merely empty — it is not
// deployed, so the call fails at the socket and the operator sees 502 on a
// console whose every other page works. The admin UI always sends the
// environment, which is why this went unnoticed; anything else calling the same
// route got a connection error dressed as a bad gateway.
//
// With nothing specified, the answer is the platform's own mode. Fail-safe
// through platformEnv: an unreadable mode resolves to SANDBOX, so an error can
// never route an operator's request at the live stack by accident.
func (h *MerchantApplicationHandler) gatewayForRequest(ctx context.Context, environment string) GatewayApplications {
	if strings.TrimSpace(environment) == "" {
		environment = h.platformEnv(ctx)
	}
	return h.gatewayFor(environment)
}

// rawAcrossStacks runs a raw gateway call against the live stack and, on 404,
// retries the sandbox stack — so an id-addressed request resolves wherever the
// application lives, without the admin UI having to pass the environment.
func (h *MerchantApplicationHandler) rawAcrossStacks(call func(GatewayApplications) (json.RawMessage, int, error)) (json.RawMessage, int, error) {
	raw, code, err := call(h.gw)
	// Not on the live stack — or the live stack could not be reached at all
	// (a Sandbox-only deployment has none) — then the Sandbox stack answers.
	if (code == http.StatusNotFound || (err != nil && code == 0)) && h.gwStaging != nil {
		return call(h.gwStaging)
	}
	if err != nil && code == 0 {
		code = http.StatusBadGateway
	}
	return raw, code, err
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

// validStatus keeps an upstream failure that produced no HTTP status (a refused
// connection is code 0) from reaching WriteHeader, which panics on it and left
// the operator's page with no answer at all.
func validStatus(code int) int {
	if code < 100 || code > 599 {
		return http.StatusBadGateway
	}
	return code
}

func writeRaw(w http.ResponseWriter, code int, raw json.RawMessage) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(validStatus(code))
	if len(raw) == 0 {
		_, _ = w.Write([]byte("{}"))
		return
	}
	_, _ = w.Write(raw)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(validStatus(code))
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (h *MerchantApplicationHandler) List(w http.ResponseWriter, r *http.Request) {
	// Route the listing to the stack matching the requested environment (ADR-025):
	// SANDBOX applications live in banzami_staging, LIVE in banzami.
	environment := r.URL.Query().Get("environment")
	raw, code, err := h.gatewayForRequest(r.Context(), environment).ListApplicationsRaw(r.Context(), r.URL.Query().Get("status"), environment)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not list applications")
		return
	}
	writeRaw(w, code, raw)
}

func (h *MerchantApplicationHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.GetApplicationRaw(r.Context(), id)
	})
	if err != nil {
		writeErr(w, code, "could not load application")
		return
	}
	writeRaw(w, code, raw)
}

// activationLink builds the link an applicant uses to set their Business PIN.
// In the Sandbox it is also returned to the operator, once: Sandbox applicants
// are testers whose addresses often receive no mail, and the operator who
// approved them hands it over. It never is on a LIVE platform.
//
// Fail-safe the other way from platformEnv: an email may say "Sandbox" when the
// mode cannot be read, but a credential is shown only when the platform is
// POSITIVELY known to be in SANDBOX mode.
func (h *MerchantApplicationHandler) activationLink(ctx context.Context, token string) (link string, showToOperator bool) {
	link = h.websiteBaseURL + "/comerciantes/activar?token=" + token
	return link, h.platform != nil && h.platform.GetMode(ctx).Mode == "SANDBOX"
}

func (h *MerchantApplicationHandler) Approve(w http.ResponseWriter, r *http.Request) {
	// Attribution comes from the authenticated operator, never the client.
	// Try the live stack; if the application isn't there (404), it belongs to the
	// SANDBOX stack — approve it there (ADR-025).
	id := chi.URLParam(r, "id")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.ApproveApplicationRaw(r.Context(), id, actorOf(r))
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not approve application")
		return
	}
	if code != http.StatusOK {
		// The gateway's own refusal — DOCUMENTS_REQUIRED, LINK_REQUIRED,
		// HANDLE_OWNED_BY_BUSINESS … — is what the operator needs to read.
		writeRaw(w, code, raw)
		return
	}
	var res service.ApprovalResult
	if err := json.Unmarshal(raw, &res); err != nil {
		writeErr(w, http.StatusBadGateway, "could not read approval")
		return
	}
	out := map[string]any{
		"status":           "APPROVED",
		"merchant_id":      res.MerchantID,
		"handle":           res.Handle,
		"api_key_prefix":   res.ApiKeyPrefix,
		"already_approved": res.AlreadyApproved,
	}
	// A repeated approval (a double click, a second operator) changed nothing:
	// no new link exists, so no second email is sent and no audit row claims a
	// decision that was not made.
	if res.AlreadyApproved {
		writeRaw(w, http.StatusOK, mustJSON(out))
		return
	}

	link, show := h.activationLink(r.Context(), res.ActivationToken)
	// The email communicates the GLOBAL platform environment (Platform Status),
	// never the application's own field — so a SANDBOX platform never says "Produção".
	h.mailer.MerchantApplicationApproved(res.Email, res.BusinessName, res.Handle, h.platformEnv(r.Context()), link)

	// Audit (no token, no full API key — prefix/handle/merchant id are safe).
	auditAfter(r, "merchant_application", id, map[string]any{
		"status":        "APPROVED",
		"resolution":    "PROVISIONED_NEW",
		"merchant_id":   res.MerchantID,
		"handle":        res.Handle,
		"email_sent_to": res.Email,
	})
	out["email_sent_to"] = res.Email
	if show {
		out["activation_url"] = link
	}
	writeRaw(w, http.StatusOK, mustJSON(out))
}

func (h *MerchantApplicationHandler) Reject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AdminNotes      string `json:"admin_notes"`
		MerchantMessage string `json:"merchant_message"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	id := chi.URLParam(r, "id")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.RejectApplicationRaw(r.Context(), id, actorOf(r), body.AdminNotes, body.MerchantMessage)
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not reject application")
		return
	}
	if code != http.StatusOK {
		writeRaw(w, code, raw)
		return
	}
	var res service.RejectionResult
	_ = json.Unmarshal(raw, &res)

	h.mailer.MerchantApplicationRejected(res.Email, res.BusinessName, res.MerchantMessage, h.platformEnv(r.Context()))

	auditAfter(r, "merchant_application", id, map[string]any{
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

// StartReview: an operator opened the application (SUBMITTED → UNDER_REVIEW).
func (h *MerchantApplicationHandler) StartReview(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.StartApplicationReviewRaw(r.Context(), id, actorOf(r))
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not start review")
		return
	}
	if code == http.StatusOK {
		auditAfter(r, "merchant_application", id, map[string]any{"status": "UNDER_REVIEW"})
	}
	writeRaw(w, code, raw)
}

// RequestInformation: the reviewer needs something before deciding. The
// applicant is emailed the request and a link to answer it; the application
// keeps its @ hold and its documents. A message is required — "please send more
// information" is not a request anyone can act on.
func (h *MerchantApplicationHandler) RequestInformation(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Message string `json:"message"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if strings.TrimSpace(body.Message) == "" {
		writeRaw(w, http.StatusBadRequest, mustJSON(map[string]string{"code": "MESSAGE_REQUIRED", "error": "say what information is needed"}))
		return
	}
	id := chi.URLParam(r, "id")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.RequestApplicationInformationRaw(r.Context(), id, actorOf(r), body.Message)
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not request information")
		return
	}
	if code != http.StatusOK {
		writeRaw(w, code, raw)
		return
	}
	var app struct {
		Email string `json:"email"`
	}
	_ = json.Unmarshal(raw, &app)
	statusURL := strings.TrimRight(h.websiteBaseURL, "/") + "/comerciantes/candidatura/estado?ref=" + id
	if app.Email != "" {
		h.mailer.MerchantInformationRequested(app.Email, strings.TrimSpace(body.Message), statusURL, h.platformEnv(r.Context()))
	}
	auditAfter(r, "merchant_application", id, map[string]any{
		"status":              "INFORMATION_REQUIRED",
		"information_request": strings.TrimSpace(body.Message),
		"email_sent_to":       app.Email,
	})
	writeRaw(w, http.StatusOK, raw)
}

// LinkExisting attaches the application to an existing Business Account,
// chosen by the operator and confirmed by typing its @handle, with a reason.
// Nothing is created; the gateway enforces every invariant.
func (h *MerchantApplicationHandler) LinkExisting(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MerchantID         string `json:"merchant_id"`
		ConfirmationHandle string `json:"confirmation_handle"`
		Reason             string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.MerchantID == "" {
		writeErr(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	if strings.TrimSpace(body.Reason) == "" {
		writeRaw(w, http.StatusBadRequest, mustJSON(map[string]string{"code": "REASON_REQUIRED", "error": "a reason is required"}))
		return
	}
	id := chi.URLParam(r, "id")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.LinkApplicationRaw(r.Context(), id, body.MerchantID, body.ConfirmationHandle, actorOf(r), body.Reason)
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not link application")
		return
	}
	if code == http.StatusOK {
		auditAfter(r, "merchant_application", id, map[string]any{
			"status":      "APPROVED",
			"resolution":  "LINKED_EXISTING",
			"merchant_id": body.MerchantID,
			"handle":      strings.TrimPrefix(strings.TrimSpace(body.ConfirmationHandle), "@"),
			"reason":      body.Reason,
		})
	}
	writeRaw(w, code, raw)
}

// ReissueActivation replaces a lost or expired activation link and emails it.
// In the Sandbox the operator also sees the link, once.
func (h *MerchantApplicationHandler) ReissueActivation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.ReissueActivationRaw(r.Context(), id)
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not reissue activation")
		return
	}
	if code != http.StatusOK {
		writeRaw(w, code, raw)
		return
	}
	var res struct {
		Email           string `json:"email"`
		BusinessName    string `json:"business_name"`
		Handle          string `json:"handle"`
		ActivationToken string `json:"activation_token"`
	}
	if err := json.Unmarshal(raw, &res); err != nil || res.ActivationToken == "" {
		writeErr(w, http.StatusBadGateway, "could not read activation")
		return
	}
	link, show := h.activationLink(r.Context(), res.ActivationToken)
	h.mailer.MerchantApplicationApproved(res.Email, res.BusinessName, res.Handle, h.platformEnv(r.Context()), link)
	auditAfter(r, "merchant_application", id, map[string]any{"activation": "REISSUED", "email_sent_to": res.Email})
	out := map[string]any{"email_sent_to": res.Email}
	if show {
		out["activation_url"] = link
	}
	writeRaw(w, http.StatusOK, mustJSON(out))
}

// LinkCandidates: the Business Accounts this application may be linked to.
func (h *MerchantApplicationHandler) LinkCandidates(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.LinkCandidatesRaw(r.Context(), id, r.URL.Query().Get("handle"))
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not list candidates")
		return
	}
	writeRaw(w, code, raw)
}

// BusinessState: the whole state of the Business an application resolved to.
func (h *MerchantApplicationHandler) BusinessState(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.ApplicationBusinessStateRaw(r.Context(), id)
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not read the business")
		return
	}
	writeRaw(w, code, raw)
}

// BusinessByID: one Business's whole state, by the Business — for the
// Business page, whether or not an application created it.
func (h *MerchantApplicationHandler) BusinessByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.BusinessStateRaw(r.Context(), id)
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not read the business")
		return
	}
	writeRaw(w, code, raw)
}

// POST /admin/v1/businesses/{id}/app-pin-reset   {confirmation, reason}
//
// A Business that forgot its app PIN gets a fresh activation link: emailed to
// the Business, shown to the operator only while the platform is SANDBOX. The
// operator types the Business's @handle to confirm and gives a reason; both
// land in the audit trail. The current PIN keeps working until the link is
// used, and using it signs out every device signed in with the old PIN.
func (h *MerchantApplicationHandler) ResetBusinessAppPin(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Confirmation string `json:"confirmation"`
		Reason       string `json:"reason"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}
	reason := strings.TrimSpace(body.Reason)
	if reason == "" {
		writeError(w, http.StatusBadRequest, "REASON_REQUIRED", "say why this Business needs a new PIN")
		return
	}
	stateRaw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.BusinessStateRaw(r.Context(), id)
	})
	if err != nil || code != http.StatusOK {
		writeRaw(w, validStatus(code), stateRaw)
		return
	}
	var st struct {
		Business struct {
			Handle string `json:"handle"`
		} `json:"business"`
	}
	_ = json.Unmarshal(stateRaw, &st)
	typed := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(body.Confirmation), "@"))
	if st.Business.Handle == "" || typed != strings.ToLower(st.Business.Handle) {
		writeError(w, http.StatusUnprocessableEntity, "CONFIRMATION_MISMATCH", "type the Business's @handle to confirm")
		return
	}
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.ResetBusinessAppPinRaw(r.Context(), id)
	})
	if err != nil || code != http.StatusOK {
		writeRaw(w, validStatus(code), raw)
		return
	}
	var res struct {
		Email           string `json:"email"`
		Handle          string `json:"handle"`
		ActivationToken string `json:"activation_token"`
		ExpiresAt       string `json:"expires_at"`
	}
	if err := json.Unmarshal(raw, &res); err != nil || res.ActivationToken == "" {
		writeErr(w, http.StatusBadGateway, "could not read the reset")
		return
	}
	link, show := h.activationLink(r.Context(), res.ActivationToken)
	if res.Email != "" {
		h.mailer.MerchantAppPinReset(res.Email, res.Handle, h.platformEnv(r.Context()), link)
	}
	auditAfter(r, "merchant", id, map[string]any{"reason": reason, "email_sent_to": res.Email, "expires_at": res.ExpiresAt})
	out := map[string]any{"email_sent_to": res.Email, "expires_at": res.ExpiresAt}
	if show {
		out["activation_url"] = link
	}
	writeRaw(w, http.StatusOK, mustJSON(out))
}

// -------------------------------------------------------------------------
// KYB documents (Track 3) — admin review. Everything is proxied to the gateway
// /internal endpoints; the gateway owns DB + storage. Read URLs pass through to
// the UI and are never logged here.
// -------------------------------------------------------------------------

func (h *MerchantApplicationHandler) ListDocuments(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.ListApplicationDocumentsRaw(r.Context(), id)
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not list documents")
		return
	}
	writeRaw(w, code, raw)
}

func (h *MerchantApplicationHandler) DocumentReadURL(w http.ResponseWriter, r *http.Request) {
	id, docID := chi.URLParam(r, "id"), chi.URLParam(r, "documentId")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.CreateDocumentReadURLRaw(r.Context(), id, docID)
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not create read url")
		return
	}
	writeRaw(w, code, raw)
}

func (h *MerchantApplicationHandler) AcceptDocument(w http.ResponseWriter, r *http.Request) {
	id, docID := chi.URLParam(r, "id"), chi.URLParam(r, "documentId")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.AcceptDocumentRaw(r.Context(), id, docID, actorOf(r))
	})
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
	id, docID := chi.URLParam(r, "id"), chi.URLParam(r, "documentId")
	raw, code, err := h.rawAcrossStacks(func(gw GatewayApplications) (json.RawMessage, int, error) {
		return gw.RejectDocumentRaw(r.Context(), id, docID, actorOf(r), body.Reason)
	})
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
