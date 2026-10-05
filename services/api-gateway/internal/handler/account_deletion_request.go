package handler

// Public web account-deletion request intake (banzami.com/supressao-de-conta),
// for someone who cannot use the in-app "Suprimir conta" flow (e.g. already
// uninstalled). Two steps, both public and rate-limited at the route:
//
//   POST /v1/account-deletion-requests         → create + email a 6-digit code
//   POST /v1/account-deletion-requests/verify   → confirm the code (EMAIL_VERIFIED)
//
// This files a REQUEST; it never deletes. A verified email proves control of the
// email, not ownership of the account, so an operator must still verify ownership
// before anything is executed (enforced by the service + a DB CHECK). The form
// NEVER accepts a PIN. A filled honeypot is answered with the same success while
// nothing is stored or sent, mirroring the public contact form.

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
	ce "github.com/banzami/banzami/services/common/email"
)

// AccountDeletionRequestHandler serves the public deletion-request intake and the
// internal operator-processing routes. core is used only by the operator Execute
// path (the public intake never touches Core).
type AccountDeletionRequestHandler struct {
	svc    *service.AccountDeletionRequestService
	mailer *ce.Sender
	core   *service.CoreApiClient
}

func NewAccountDeletionRequestHandler(svc *service.AccountDeletionRequestService, mailer *ce.Sender, core *service.CoreApiClient) *AccountDeletionRequestHandler {
	return &AccountDeletionRequestHandler{svc: svc, mailer: mailer, core: core}
}

// Enabled reports whether the intake can run (configured service + working mailer).
func (h *AccountDeletionRequestHandler) Enabled() bool {
	return h != nil && h.svc != nil && h.mailer != nil && h.mailer.Enabled()
}

type deletionRequestBody struct {
	SubjectType string `json:"subject_type"` // CONSUMER | BUSINESS
	Handle      string `json:"handle"`
	Email       string `json:"email"`
	// Honeypot: a field no human fills. Non-empty ⇒ bot ⇒ same success, no effect.
	Website string `json:"website"`
}

// POST /v1/account-deletion-requests
func (h *AccountDeletionRequestHandler) Create(w http.ResponseWriter, r *http.Request) {
	if !h.Enabled() {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "account deletion requests are not available")
		return
	}
	var body deletionRequestBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}

	// Bot answer: a 200 shaped like success that did nothing.
	if strings.TrimSpace(body.Website) != "" {
		writeJSON(w, http.StatusOK, map[string]any{"status": "pending_verification"})
		return
	}

	subjectType := strings.ToUpper(strings.TrimSpace(body.SubjectType))
	if subjectType != "CONSUMER" && subjectType != "BUSINESS" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "subject_type must be CONSUMER or BUSINESS")
		return
	}
	handle := service.NormaliseHandle(body.Handle)
	if err := service.ValidateHandle(handle); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "a valid @handle is required")
		return
	}
	email := strings.TrimSpace(body.Email)
	if !looksLikeEmail(email) {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_EMAIL", "a valid email is required")
		return
	}

	created, err := h.svc.Create(r.Context(), subjectType, handle, email)
	if err != nil {
		slog.ErrorContext(r.Context(), "account deletion request create failed", "error", err)
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not file your request right now")
		return
	}

	html, text := renderDeletionCodeEmail(created.Code)
	// Security email: From noreply@, no Reply-To — the code is the whole action.
	msg := h.mailer.Automated("account_deletion_code", email,
		"O seu código de verificação Banzami", html, text, "")
	if err := h.mailer.DeliverErr(msg); err != nil {
		// The row exists; the operator can re-issue. Surface a soft failure so the
		// visitor can retry rather than believing a code is on its way.
		slog.ErrorContext(r.Context(), "account deletion request code email failed", "error", err)
		apierror.Respond(w, r, http.StatusBadGateway, "DELIVERY_FAILED", "could not send the verification code right now")
		return
	}

	// The request id is an opaque token the client carries to the verify step. It
	// is not sensitive on its own (no code, no account data).
	writeJSON(w, http.StatusOK, map[string]any{
		"status":     "pending_verification",
		"request_id": created.RequestID,
	})
}

type deletionVerifyBody struct {
	RequestID string `json:"request_id"`
	Code      string `json:"code"`
}

// POST /v1/account-deletion-requests/verify
func (h *AccountDeletionRequestHandler) Verify(w http.ResponseWriter, r *http.Request) {
	if !h.Enabled() {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "account deletion requests are not available")
		return
	}
	var body deletionVerifyBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}
	err := h.svc.Verify(r.Context(), body.RequestID, strings.TrimSpace(body.Code))
	switch {
	case err == nil:
		// Email control proven. This does NOT authorise deletion — an operator
		// verifies ownership before anything runs.
		writeJSON(w, http.StatusOK, map[string]any{"status": "email_verified"})
	case isDeletionLocked(err):
		apierror.Respond(w, r, http.StatusTooManyRequests, "TOO_MANY_ATTEMPTS", "too many attempts; request a new code")
	default:
		// Non-enumerating: wrong code / expired / unknown id all look the same.
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_CODE", "invalid or expired code")
	}
}

func isDeletionLocked(err error) bool {
	return err != nil && strings.Contains(err.Error(), "too many attempts")
}

// ── Operator processing (internal routes; admin-api with X-Internal-Key) ─────

// respondDeletionErr maps the service's sentinels to operator-facing statuses.
// The operator UI is a trusted surface, so these carry the real reason.
func (h *AccountDeletionRequestHandler) respondDeletionErr(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, service.ErrDeletionRequestNotFound):
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "request not found")
	case errors.Is(err, service.ErrDeletionSubjectNotFound):
		apierror.Respond(w, r, http.StatusConflict, "SUBJECT_NOT_FOUND", "the handle does not resolve to an account of that kind")
	case errors.Is(err, service.ErrDeletionRequestState):
		apierror.Respond(w, r, http.StatusConflict, "INVALID_STATE", err.Error())
	default:
		slog.ErrorContext(r.Context(), "account deletion operator action failed", "error", err)
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not complete the action right now")
	}
}

// GET /internal/v1/account-deletion-requests?status=...
func (h *AccountDeletionRequestHandler) OperatorList(w http.ResponseWriter, r *http.Request) {
	rows, err := h.svc.List(r.Context(), r.URL.Query().Get("status"))
	if err != nil {
		h.respondDeletionErr(w, r, err)
		return
	}
	if rows == nil {
		rows = []service.DeletionRequestRow{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"requests": rows})
}

// GET /internal/v1/account-deletion-requests/{id}
func (h *AccountDeletionRequestHandler) OperatorGet(w http.ResponseWriter, r *http.Request) {
	row, err := h.svc.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		h.respondDeletionErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, row)
}

// POST /internal/v1/account-deletion-requests/{id}/record-ownership
// Body: {operator, result: VERIFIED|FAILED, notes?}. VERIFIED advances the
// request to OPERATOR_REVIEW; FAILED rejects it.
func (h *AccountDeletionRequestHandler) OperatorRecordOwnership(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Operator string `json:"operator"`
		Result   string `json:"result"`
		Notes    string `json:"notes"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}
	row, err := h.svc.RecordOwnership(r.Context(), chi.URLParam(r, "id"), body.Operator, body.Result, body.Notes)
	if err != nil {
		h.respondDeletionErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, row)
}

// POST /internal/v1/account-deletion-requests/{id}/reject
func (h *AccountDeletionRequestHandler) OperatorReject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Operator string `json:"operator"`
		Reason   string `json:"reason"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}
	row, err := h.svc.Reject(r.Context(), chi.URLParam(r, "id"), body.Operator, body.Reason)
	if err != nil {
		h.respondDeletionErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, row)
}

// POST /internal/v1/account-deletion-requests/{id}/execute
// The irreversible step: only an OPERATOR_REVIEW request with a VERIFIED
// ownership check runs, and only through the ledger-safe Core deletion.
func (h *AccountDeletionRequestHandler) OperatorExecute(w http.ResponseWriter, r *http.Request) {
	if h.core == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "deletion execution is not available")
		return
	}
	var body struct {
		Operator  string `json:"operator"`
		RequestID string `json:"request_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}
	row, err := h.svc.Execute(r.Context(), chi.URLParam(r, "id"), body.Operator, body.RequestID, h.core)
	if err != nil {
		if errors.Is(err, service.ErrBusinessDeletionPendingSettlement) {
			apierror.Respond(w, r, http.StatusConflict, "PENDING_SETTLEMENT",
				"a settlement has not finished for this Business — try again shortly")
			return
		}
		h.respondDeletionErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, row)
}

// renderDeletionCodeEmail composes the verification-code email in the shared
// design system. The code is the whole action: no link.
func renderDeletionCodeEmail(code string) (html, text string) {
	const intro = "Recebemos um pedido de supressão de conta associado a este email. Use o código abaixo para confirmar que controla este endereço. A confirmação do email não suprime a conta: a equipa verifica a titularidade antes de processar o pedido."
	const notice = "Este código expira em 15 minutos. Se não pediu a supressão da sua conta, ignore este email com segurança."
	body := ce.Title("Confirme o seu pedido") +
		ce.Para(intro) +
		ce.OTPBoxes(code) +
		ce.Notice("clock", notice)
	html = ce.RenderLayout(ce.LayoutOpts{
		Subtitle: "Supressão de conta", BadgeKind: "security", SafetyKind: "security",
		Preheader: "O seu código de verificação para o pedido de supressão de conta.", Body: body,
	})
	text = ce.TextDoc("Confirme o seu pedido",
		[]string{intro, notice},
		[]ce.InfoRow{{Label: "Código de verificação", Value: code, Mono: true}},
		"", "", ce.FooterSafety("security"))
	return
}
