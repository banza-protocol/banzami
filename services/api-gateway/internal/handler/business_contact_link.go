package handler

// Internal routes (X-Internal-Key, called by developer-api) for the two Business
// email flows behind Path B (ADR-060):
//
//   /internal/v1/business-contacts/verify/start    → email a BUSINESS_CONTACT_VERIFY code
//   /internal/v1/business-contacts/verify/confirm  → confirm it, return a grant
//   /internal/v1/business-contacts/persist          → spend the grant, record the contact
//   /internal/v1/businesses/{merchantID}/verified-contact → masked contact (or none)
//   /internal/v1/business-project-link/start         → email a BUSINESS_PROJECT_LINK code
//                                                       to the verified contact
//   /internal/v1/business-project-link/confirm       → confirm it, return a grant
//   /internal/v1/business-project-link/redeem        → spend the grant, return the target
//
// developer-api is the authoriser: it decides the caller may enrol/verify/link
// this Business (OWNER/ADMIN of an authorised Business-management context) before
// calling here. These routes carry no end-user session; they trust the internal
// key and bind every OTP/grant to merchant/project/environment.

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

// BusinessContactLinkHandler serves the internal Business contact + link routes.
type BusinessContactLinkHandler struct {
	svc    *service.BusinessContactService
	mailer *ce.Sender
}

func NewBusinessContactLinkHandler(svc *service.BusinessContactService, mailer *ce.Sender) *BusinessContactLinkHandler {
	return &BusinessContactLinkHandler{svc: svc, mailer: mailer}
}

// Enabled reports whether these flows can run (configured engine + working mailer).
func (h *BusinessContactLinkHandler) Enabled() bool {
	return h != nil && h.svc != nil && h.mailer != nil && h.mailer.Enabled()
}

// respondContactErr maps the engine's errors to stable internal codes. Neutral
// where it must be (never an availability/enumeration oracle); fail-closed on
// an unavailable engine.
func respondContactErr(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, service.ErrBusinessContactCooldown):
		apierror.Respond(w, r, http.StatusTooManyRequests, "COOLDOWN", "a code was sent recently; wait a moment")
	case errors.Is(err, service.ErrBusinessContactLocked):
		apierror.Respond(w, r, http.StatusTooManyRequests, "TOO_MANY_ATTEMPTS", "too many attempts; request a new code")
	case errors.Is(err, service.ErrBusinessContactInvalid):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_CODE", "invalid or expired verification")
	case errors.Is(err, service.ErrNoVerifiedContact):
		apierror.Respond(w, r, http.StatusConflict, "NO_VERIFIED_CONTACT", "this business has no verified contact")
	case errors.Is(err, service.ErrBusinessLinkGrantInvalid):
		apierror.Respond(w, r, http.StatusGone, "LINK_GRANT_EXPIRED", "this authorisation is no longer valid")
	case errors.Is(err, service.ErrBusinessLinkNotReady):
		apierror.Respond(w, r, http.StatusConflict, "BUSINESS_NOT_READY", "this business is not ready to link")
	default:
		slog.ErrorContext(r.Context(), "business contact/link engine error", "error", err)
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not complete right now")
	}
}

func (h *BusinessContactLinkHandler) sendCode(r *http.Request, to, code string) error {
	html, text := renderBusinessCodeEmail(code)
	msg := h.mailer.Automated("business_contact_code", to,
		"O seu código de verificação Banzami", html, text, "")
	return h.mailer.DeliverErr(msg)
}

type contactVerifyStartBody struct {
	SubjectID string `json:"subject_id"`
	Email     string `json:"email"`
}

// StartContactVerify emails a contact-verification code to the supplied address
// for a subject (project pre-provision, or merchant for enrolment).
func (h *BusinessContactLinkHandler) StartContactVerify(w http.ResponseWriter, r *http.Request) {
	var b contactVerifyStartBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<12)).Decode(&b); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid request")
		return
	}
	code, masked, err := h.svc.StartContactVerify(r.Context(), strings.TrimSpace(b.SubjectID), b.Email, clientIP(r))
	if err != nil {
		respondContactErr(w, r, err)
		return
	}
	if err := h.sendCode(r, b.Email, code); err != nil {
		slog.ErrorContext(r.Context(), "business contact code email failed", "error", err)
		apierror.Respond(w, r, http.StatusBadGateway, "DELIVERY_FAILED", "could not send the code right now")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"masked_email": masked})
}

type contactVerifyConfirmBody struct {
	SubjectID string `json:"subject_id"`
	Code      string `json:"code"`
}

// ConfirmContactVerify returns a single-use CONTACT_VERIFIED grant on a correct code.
func (h *BusinessContactLinkHandler) ConfirmContactVerify(w http.ResponseWriter, r *http.Request) {
	var b contactVerifyConfirmBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<12)).Decode(&b); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid request")
		return
	}
	grant, email, err := h.svc.ConfirmContactVerify(r.Context(), strings.TrimSpace(b.SubjectID), strings.TrimSpace(b.Code))
	if err != nil {
		respondContactErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"grant": grant, "email": email})
}

type contactPersistBody struct {
	Grant      string `json:"grant"`
	MerchantID string `json:"merchant_id"`
}

// PersistVerifiedContact spends a CONTACT_VERIFIED grant to record the contact.
func (h *BusinessContactLinkHandler) PersistVerifiedContact(w http.ResponseWriter, r *http.Request) {
	var b contactPersistBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<12)).Decode(&b); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid request")
		return
	}
	masked, err := h.svc.PersistVerifiedContact(r.Context(), strings.TrimSpace(b.Grant), strings.TrimSpace(b.MerchantID))
	if err != nil {
		respondContactErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"masked_email": masked})
}

// VerifiedContact returns the masked verified contact for a merchant, or none.
func (h *BusinessContactLinkHandler) VerifiedContact(w http.ResponseWriter, r *http.Request) {
	merchantID := strings.TrimSpace(chi.URLParam(r, "merchantID"))
	_, masked, ok, err := h.svc.VerifiedContactFor(r.Context(), merchantID)
	if err != nil {
		respondContactErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"has_contact": ok, "masked_email": masked})
}

type projectLinkStartBody struct {
	MerchantID string `json:"merchant_id"`
	ProjectID  string `json:"project_id"`
}

// StartProjectLink emails a link code to the Business's verified contact.
func (h *BusinessContactLinkHandler) StartProjectLink(w http.ResponseWriter, r *http.Request) {
	var b projectLinkStartBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<12)).Decode(&b); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid request")
		return
	}
	code, dest, masked, err := h.svc.StartProjectLink(r.Context(), strings.TrimSpace(b.MerchantID), strings.TrimSpace(b.ProjectID), clientIP(r))
	if err != nil {
		respondContactErr(w, r, err)
		return
	}
	if err := h.sendCode(r, dest, code); err != nil {
		slog.ErrorContext(r.Context(), "business link code email failed", "error", err)
		apierror.Respond(w, r, http.StatusBadGateway, "DELIVERY_FAILED", "could not send the code right now")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"masked_email": masked})
}

type projectLinkConfirmBody struct {
	MerchantID string `json:"merchant_id"`
	ProjectID  string `json:"project_id"`
	Code       string `json:"code"`
}

// ConfirmProjectLink returns a single-use BUSINESS_PROJECT_LINK grant.
func (h *BusinessContactLinkHandler) ConfirmProjectLink(w http.ResponseWriter, r *http.Request) {
	var b projectLinkConfirmBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<12)).Decode(&b); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid request")
		return
	}
	grant, err := h.svc.ConfirmProjectLink(r.Context(), strings.TrimSpace(b.MerchantID), strings.TrimSpace(b.ProjectID), strings.TrimSpace(b.Code))
	if err != nil {
		respondContactErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"grant": grant})
}

type projectLinkRedeemBody struct {
	Grant     string `json:"grant"`
	ProjectID string `json:"project_id"`
}

// RedeemProjectLink spends the grant and returns the Business as a link target.
func (h *BusinessContactLinkHandler) RedeemProjectLink(w http.ResponseWriter, r *http.Request) {
	var b projectLinkRedeemBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<12)).Decode(&b); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid request")
		return
	}
	target, err := h.svc.RedeemProjectLinkGrant(r.Context(), strings.TrimSpace(b.Grant), strings.TrimSpace(b.ProjectID))
	if err != nil {
		respondContactErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, target)
}

func renderBusinessCodeEmail(code string) (html, text string) {
	const intro = "Recebemos um pedido para confirmar o controlo de um negócio Banzami associado a este email. Use o código abaixo para confirmar que controla este endereço."
	const notice = "Este código expira em 10 minutos. Se não pediu esta confirmação, ignore este email com segurança."
	body := ce.Title("Confirme o controlo do negócio") +
		ce.Para(intro) +
		ce.OTPBoxes(code) +
		ce.Notice("clock", notice)
	html = ce.RenderLayout(ce.LayoutOpts{
		Subtitle: "Controlo do negócio", BadgeKind: "security", SafetyKind: "security",
		Preheader: "O seu código de verificação de controlo do negócio.", Body: body,
	})
	text = ce.TextDoc("Confirme o controlo do negócio",
		[]string{intro, notice},
		[]ce.InfoRow{{Label: "Código de verificação", Value: code, Mono: true}},
		"", "", ce.FooterSafety("security"))
	return
}
