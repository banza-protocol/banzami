package handler

// Consumer verified-email + PIN-recovery HTTP surface (public-api).
//
//   POST /v1/auth/email/otp          — signup: send an email verification code
//   POST /v1/auth/email/verify        — signup: confirm the code → grant token
//   POST /v1/me/pin                   — authenticated: change PIN (fresh current PIN)
//   POST /v1/auth/pin-reset/request   — forgot PIN: send a code to the verified email
//   POST /v1/auth/pin-reset/verify    — forgot PIN: confirm the code → reset token
//   POST /v1/auth/pin-reset/confirm   — forgot PIN: set the new PIN with the reset token
//
// Login stays @handle + PIN; none of this changes that. The OTP is never the
// reset token (a separate opaque grant is). The forgot-PIN request is
// anti-enumeration: it answers the same whether or not the handle exists, has an
// email, or is active. A reset can never revive a non-ACTIVE account. Email
// delivery failure never changes a credential (fail-closed).

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	ce "github.com/banzami/banzami/services/common/email"
	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

var (
	emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
	// Canonical Banzami PIN: EXACTLY 6 numeric digits (leading zeros valid). A PIN
	// is a secret string, never an integer — "012345" is not "12345".
	pinRe = regexp.MustCompile(`^[0-9]{6}$`)
)

// validateConsumerPin is the single, canonical Consumer PIN policy: exactly 6
// numeric digits. Used by signup, Change PIN and PIN reset.
func validateConsumerPin(pin string) error {
	if !pinRe.MatchString(pin) {
		return fmt.Errorf("o PIN tem de ter exatamente 6 dígitos")
	}
	return nil
}

func normalizeEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

// recoveryPolicy resolves the environment's recovery channel. No SMS sender is
// wired yet, so LIVE recovery is fail-closed (false) — never an email fallback.
func (h *AuthHandler) recoveryPolicy() service.RecoveryPolicy {
	return service.NewRecoveryPolicy(h.cfg.Environment, false /* SMS sender not operational */)
}

func looksLikeConsumerEmail(e string) bool {
	return len(e) <= 254 && emailRe.MatchString(e)
}

// POST /v1/auth/email/otp — signup email verification: issue + email a code.
func (h *AuthHandler) RequestEmailOtp(w http.ResponseWriter, r *http.Request) {
	if !h.recoveryEnabled() {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "email verification is not available")
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	email := normalizeEmail(body.Email)
	if !looksLikeConsumerEmail(email) {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_EMAIL", "a valid email is required")
		return
	}
	code, err := h.rec.RequestSignupOtp(r.Context(), email, clientIP(r))
	if err != nil {
		if errors.Is(err, service.ErrOtpCooldown) || errors.Is(err, service.ErrOtpTooMany) {
			apierror.Respond(w, r, http.StatusTooManyRequests, "TOO_MANY_REQUESTS",
				"too many codes requested — wait a moment before trying again")
			return
		}
		slog.ErrorContext(r.Context(), "signup otp issue failed", "error", err)
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not send the code right now")
		return
	}
	html, text := renderSignupCodeEmail(code)
	if err := h.mailer.DeliverErr(h.mailer.Automated("consumer_email_verification", email,
		"O seu código de verificação Banzami", html, text, "")); err != nil {
		// Delivery failed — nothing persisted changes a credential here, and no
		// account exists yet. Surface a soft failure so the app can retry.
		apierror.Respond(w, r, http.StatusBadGateway, "DELIVERY_FAILED", "could not send the verification code right now")
		return
	}
	respond(w, http.StatusOK, map[string]any{"status": "sent"})
}

// POST /v1/auth/email/verify — confirm a signup code → EMAIL_VERIFIED grant.
func (h *AuthHandler) VerifyEmailOtp(w http.ResponseWriter, r *http.Request) {
	if !h.recoveryEnabled() {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "email verification is not available")
		return
	}
	var body struct {
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	email := normalizeEmail(body.Email)
	token, err := h.rec.VerifySignupOtp(r.Context(), email, strings.TrimSpace(body.Code))
	switch {
	case err == nil:
		respond(w, http.StatusOK, map[string]any{
			"status":                   "verified",
			"email_verification_token": token,
		})
	case errors.Is(err, service.ErrRecoveryOtpLocked):
		apierror.Respond(w, r, http.StatusTooManyRequests, "TOO_MANY_ATTEMPTS", "too many attempts; request a new code")
	default:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_CODE", "invalid or expired code")
	}
}

// maskEmail renders f***@example.com for display on a locked/profile screen.
func maskEmail(e string) string {
	at := strings.IndexByte(e, '@')
	if at <= 0 {
		return ce.MaskAddress(e)
	}
	local, domain := e[:at], e[at:]
	if len(local) <= 1 {
		return local + "***" + domain
	}
	return local[:1] + "***" + domain
}

// GET /v1/me/recovery-email — authenticated: whether a verified recovery email
// is on file and, if so, a masked form for display. Never returns the full email.
func (h *AuthHandler) RecoveryEmailStatus(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "not signed in")
		return
	}
	email, err := h.creds.ConsumerEmail(r.Context(), consumer.ID)
	if err != nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not read your account")
		return
	}
	resp := map[string]any{"has_email": email != ""}
	if email != "" {
		resp["email_masked"] = maskEmail(email)
	}
	respond(w, http.StatusOK, resp)
}

// POST /v1/me/recovery-email/otp — authenticated: start adding a recovery email
// to a (typically legacy) account that has none. Sends a code to the new email.
func (h *AuthHandler) RequestRecoveryEmailOtp(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "not signed in")
		return
	}
	if !h.recoveryEnabled() {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "recovery email is not available")
		return
	}
	// Only an account WITHOUT a verified email may add one here. Changing an
	// existing email is a separate, not-yet-built flow with its own policy.
	if existing, err := h.creds.ConsumerEmail(r.Context(), consumer.ID); err == nil && existing != "" {
		apierror.Respond(w, r, http.StatusConflict, "EMAIL_ALREADY_SET",
			"this account already has a recovery email")
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	email := normalizeEmail(body.Email)
	if !looksLikeConsumerEmail(email) {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_EMAIL", "a valid email is required")
		return
	}
	code, err := h.rec.RequestSignupOtp(r.Context(), email, clientIP(r))
	if err != nil {
		if errors.Is(err, service.ErrOtpCooldown) || errors.Is(err, service.ErrOtpTooMany) {
			apierror.Respond(w, r, http.StatusTooManyRequests, "TOO_MANY_REQUESTS",
				"too many codes requested — wait a moment before trying again")
			return
		}
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not send the code right now")
		return
	}
	html, text := renderSignupCodeEmail(code)
	if err := h.mailer.DeliverErr(h.mailer.Automated("consumer_recovery_email_add", email,
		"O seu código de verificação Banzami", html, text, "")); err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "DELIVERY_FAILED", "could not send the verification code right now")
		return
	}
	respond(w, http.StatusOK, map[string]any{"status": "sent"})
}

// POST /v1/me/recovery-email/verify — authenticated: confirm the code and
// associate the email with the account (email_verified_at). After this,
// "Esqueci o PIN" works for the account.
func (h *AuthHandler) VerifyRecoveryEmailOtp(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "not signed in")
		return
	}
	if !h.recoveryEnabled() {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "recovery email is not available")
		return
	}
	if existing, err := h.creds.ConsumerEmail(r.Context(), consumer.ID); err == nil && existing != "" {
		apierror.Respond(w, r, http.StatusConflict, "EMAIL_ALREADY_SET",
			"this account already has a recovery email")
		return
	}
	var body struct {
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	email := normalizeEmail(body.Email)
	// Verify the OTP (proves control of the email). The grant it issues is unused
	// here — an authenticated session associates the email directly.
	if _, err := h.rec.VerifySignupOtp(r.Context(), email, strings.TrimSpace(body.Code)); err != nil {
		if errors.Is(err, service.ErrRecoveryOtpLocked) {
			apierror.Respond(w, r, http.StatusTooManyRequests, "TOO_MANY_ATTEMPTS", "too many attempts; request a new code")
			return
		}
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_CODE", "invalid or expired code")
		return
	}
	// Associate in Core (1 verified email = 1 live Consumer; EMAIL_TAKEN if used).
	if err := h.core.SetConsumerEmail(r.Context(), consumer.ID, email); err != nil {
		if errors.Is(err, service.ErrEmailTaken) {
			apierror.Respond(w, r, http.StatusConflict, "EMAIL_TAKEN", "this email is already in use by another account")
			return
		}
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not save the email")
		return
	}
	h.auditConsumer(r, consumer.ID, "CONSUMER_EMAIL_VERIFIED")
	respond(w, http.StatusOK, map[string]any{"status": "verified", "email_masked": maskEmail(email)})
}

// POST /v1/me/pin — authenticated Change PIN.
func (h *AuthHandler) ChangePin(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "not signed in")
		return
	}
	var body struct {
		CurrentPin string `json:"current_pin"`
		NewPin     string `json:"new_pin"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if err := validateConsumerPin(body.NewPin); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD", err.Error())
		return
	}
	// Fresh re-auth of the CURRENT PIN, server-side (never trusted from the client).
	if err := h.creds.VerifyPinByID(r.Context(), consumer.ID, body.CurrentPin); err != nil {
		apierror.Respond(w, r, http.StatusForbidden, "REAUTH_REQUIRED", "current PIN is incorrect")
		return
	}
	if err := h.creds.UpdatePin(r.Context(), consumer.ID, body.NewPin); err != nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not change the PIN")
		return
	}
	// Revoke every existing session (bump the version), then re-mint a token for
	// THIS device so the change does not sign the person out of the app they are
	// using. A compromised device's old token dies.
	if err := h.creds.RevokeSessions(r.Context(), consumer.ID); err != nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not rotate sessions")
		return
	}
	version, err := h.creds.CurrentTokenVersion(r.Context(), consumer.ID)
	if err != nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not rotate sessions")
		return
	}
	token, expiresAt, err := middleware.NewConsumerToken(
		h.cfg.JWTSecret, consumer.ID, version, []string{"consumer"}, consumerTokenTTL,
	)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not issue token")
		return
	}
	h.auditConsumer(r, consumer.ID, "CONSUMER_PIN_CHANGED")
	h.sendPinChangedEmail(r, consumer.ID)
	respond(w, http.StatusOK, map[string]any{
		"status":     "changed",
		"token":      token,
		"expires_at": expiresAt,
		"token_type": "Bearer",
	})
}

// POST /v1/auth/pin-reset/request — forgot PIN (unauthenticated, anti-enumeration).
func (h *AuthHandler) RequestPinReset(w http.ResponseWriter, r *http.Request) {
	// A generic answer regardless of outcome — it never reveals whether the
	// handle exists, has an email, or is active.
	generic := func() {
		respond(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"message": "Se os dados corresponderem a uma conta elegível, enviaremos um código para o email associado.",
		})
	}
	if !h.recoveryEnabled() {
		// Still generic: do not disclose that the subsystem is off as a probe signal.
		generic()
		return
	}
	var body struct {
		Handle string `json:"handle"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil {
		// A malformed body is the same generic answer (no enumeration surface).
		generic()
		return
	}
	handle := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(body.Handle), "@")))
	if handle == "" {
		generic()
		return
	}
	target, err := h.creds.LookupResetTarget(r.Context(), handle)
	if err != nil {
		// A store outage is logged but still answered generically.
		slog.ErrorContext(r.Context(), "pin reset lookup failed", "error", err)
		generic()
		return
	}
	if !target.Eligible {
		generic()
		return
	}
	// Recovery channel is decided by the environment policy, centrally. Email
	// recovery is permitted ONLY in Sandbox; LIVE requires SMS to a verified
	// phone and is fail-closed here (no SMS sender wired) — never an email
	// fallback. The response stays generic regardless (no enumeration).
	if !h.recoveryPolicy().EmailRecoveryAllowed() {
		generic()
		return
	}
	code, err := h.rec.RequestPinResetOtp(r.Context(), target.ConsumerID, target.Email, clientIP(r))
	if err != nil {
		slog.ErrorContext(r.Context(), "pin reset otp issue failed", "error", err)
		generic()
		return
	}
	html, text := renderPinResetCodeEmail(code)
	if err := h.mailer.DeliverErr(h.mailer.Automated("consumer_pin_reset", target.Email,
		"Código para redefinir o seu PIN Banzami", html, text, "")); err != nil {
		// Delivery failed: nothing changed, the old PIN still works. Generic answer.
		slog.ErrorContext(r.Context(), "pin reset email failed", "error", err)
	}
	generic()
}

// POST /v1/auth/pin-reset/verify — confirm a reset code → PIN_RESET grant.
func (h *AuthHandler) VerifyPinReset(w http.ResponseWriter, r *http.Request) {
	if !h.recoveryEnabled() {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "PIN reset is not available")
		return
	}
	var body struct {
		Handle string `json:"handle"`
		Code   string `json:"code"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	handle := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(body.Handle), "@")))
	// Resolve the handle to the account the code was issued for. A wrong handle,
	// an ineligible account, or a wrong code all look the same (INVALID_CODE).
	target, err := h.creds.LookupResetTarget(r.Context(), handle)
	if err != nil || !target.Eligible {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_CODE", "invalid or expired code")
		return
	}
	token, err := h.rec.VerifyPinResetOtp(r.Context(), target.ConsumerID, strings.TrimSpace(body.Code))
	switch {
	case err == nil:
		respond(w, http.StatusOK, map[string]any{"status": "verified", "reset_token": token})
	case errors.Is(err, service.ErrRecoveryOtpLocked):
		apierror.Respond(w, r, http.StatusTooManyRequests, "TOO_MANY_ATTEMPTS", "too many attempts; request a new code")
	default:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_CODE", "invalid or expired code")
	}
}

// POST /v1/auth/pin-reset/confirm — set the new PIN with a verified reset grant.
func (h *AuthHandler) ConfirmPinReset(w http.ResponseWriter, r *http.Request) {
	if !h.recoveryEnabled() {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "PIN reset is not available")
		return
	}
	var body struct {
		ResetToken string `json:"reset_token"`
		NewPin     string `json:"new_pin"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if err := validateConsumerPin(body.NewPin); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD", err.Error())
		return
	}
	// Consume the single-use reset grant → the consumer it authorises.
	consumerID, err := h.rec.ConsumePinResetGrant(r.Context(), strings.TrimSpace(body.ResetToken))
	if err != nil {
		apierror.Respond(w, r, http.StatusForbidden, "RESET_INVALID", "the reset authorization is invalid or expired")
		return
	}
	// A reset NEVER revives a non-ACTIVE account, even if a grant was issued
	// before the account was closed/suspended. Re-assert status at the last step.
	active, err := h.creds.StatusActive(r.Context(), consumerID)
	if err != nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not reset the PIN")
		return
	}
	if !active {
		apierror.Respond(w, r, http.StatusForbidden, "ACCOUNT_NOT_ACTIVE", "this account cannot be reset")
		return
	}
	if err := h.creds.UpdatePin(r.Context(), consumerID, body.NewPin); err != nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not reset the PIN")
		return
	}
	// Revoke ALL sessions: a reset from an unauthenticated flow must not leave any
	// pre-existing (possibly attacker) session alive. The person signs in anew.
	if err := h.creds.RevokeSessions(r.Context(), consumerID); err != nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "could not reset the PIN")
		return
	}
	h.auditConsumer(r, consumerID, "CONSUMER_PIN_RESET")
	h.sendPinChangedEmail(r, consumerID)
	respond(w, http.StatusOK, map[string]any{"status": "reset"})
}

// auditConsumer appends an audit row (best-effort; logged on failure — the state
// change already happened and must not be rolled back by an audit write).
func (h *AuthHandler) auditConsumer(r *http.Request, consumerID, action string) {
	if err := h.creds.WriteAudit(r.Context(), consumerID, action, consumerID, nil); err != nil {
		slog.ErrorContext(r.Context(), "consumer audit write failed", "action", action, "consumer_id", consumerID, "error", err)
	}
}

// sendPinChangedEmail notifies the account's email that the PIN changed. It never
// includes the PIN or any secret. Best-effort: a failure is logged, never fatal.
func (h *AuthHandler) sendPinChangedEmail(r *http.Request, consumerID string) {
	if h.mailer == nil || !h.mailer.Enabled() {
		return
	}
	email, err := h.creds.ConsumerEmail(r.Context(), consumerID)
	if err != nil || email == "" {
		return
	}
	html, text := renderPinChangedEmail()
	_ = h.mailer.DeliverErr(h.mailer.Automated("consumer_pin_changed", email,
		"O seu PIN Banzami foi alterado", html, text, ""))
}

// ── Emails (shared design system; the code is the whole action, no link) ─────

func renderSignupCodeEmail(code string) (html, text string) {
	const intro = "Use o código abaixo para confirmar o seu email e concluir a criação da sua conta Banzami."
	const notice = "Este código expira em 10 minutos. Se não pediu este código, ignore este email."
	body := ce.Title("Confirme o seu email") + ce.Para(intro) + ce.OTPBoxes(code) + ce.Notice("clock", notice)
	html = ce.RenderLayout(ce.LayoutOpts{
		Subtitle: "Criar conta", BadgeKind: "security", SafetyKind: "security",
		Preheader: "O seu código de verificação Banzami.", Body: body,
	})
	text = ce.TextDoc("Confirme o seu email", []string{intro, notice},
		[]ce.InfoRow{{Label: "Código", Value: code, Mono: true}}, "", "", ce.FooterSafety("security"))
	return
}

func renderPinResetCodeEmail(code string) (html, text string) {
	const intro = "Recebemos um pedido para redefinir o PIN da sua conta Banzami. Use o código abaixo para continuar. O seu PIN atual continua válido até concluir a redefinição."
	const notice = "Este código expira em 10 minutos. Se não pediu a redefinição do PIN, ignore este email e o seu PIN permanece inalterado."
	body := ce.Title("Redefinir o PIN") + ce.Para(intro) + ce.OTPBoxes(code) + ce.Notice("clock", notice)
	html = ce.RenderLayout(ce.LayoutOpts{
		Subtitle: "Redefinir PIN", BadgeKind: "security", SafetyKind: "security",
		Preheader: "Código para redefinir o seu PIN Banzami.", Body: body,
	})
	text = ce.TextDoc("Redefinir o PIN", []string{intro, notice},
		[]ce.InfoRow{{Label: "Código", Value: code, Mono: true}}, "", "", ce.FooterSafety("security"))
	return
}

func renderPinChangedEmail() (html, text string) {
	const intro = "O PIN da sua conta Banzami foi alterado. Se foi você, não precisa de fazer nada."
	const notice = "Se não foi você, a sua conta pode estar em risco. Contacte-nos imediatamente em contact@banzami.com."
	body := ce.Title("O seu PIN foi alterado") + ce.Para(intro) + ce.Notice("shield", notice)
	html = ce.RenderLayout(ce.LayoutOpts{
		Subtitle: "Segurança", BadgeKind: "security", SafetyKind: "security",
		Preheader: "O seu PIN Banzami foi alterado.", Body: body,
	})
	text = ce.TextDoc("O seu PIN foi alterado", []string{intro, notice}, nil, "", "", ce.FooterSafety("security"))
	return
}

// clientIP is the stored request IP for an OTP row (diagnostics, not security).
func clientIP(r *http.Request) string {
	return r.RemoteAddr
}
