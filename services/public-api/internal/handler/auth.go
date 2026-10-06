package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	ce "github.com/banzami/banzami/services/common/email"
	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/config"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

const consumerTokenTTL = 24 * time.Hour

// AuthHandler handles consumer registration and token issuance.
type AuthHandler struct {
	cfg      *config.Config
	core     *service.CorePublicClient
	creds    *service.CredentialStore
	rec      *service.ConsumerRecoveryService // nil ⇒ email/recovery flows unavailable
	mailer   *ce.Sender                       // nil ⇒ email delivery unavailable
	throttle *service.SourceThrottle          // nil ⇒ no persistent source throttle

	// requireThrottle makes the login-abuse throttle a HARD requirement: when set
	// and the throttle is absent (misconfigured secret), an untrusted login fails
	// closed instead of running unthrottled. Production sets this true; the boot
	// gate already refuses to start without a secret, so this is defence in depth
	// that guarantees the protection is never silently disabled on the login path.
	requireThrottle bool
}

func NewAuthHandler(cfg *config.Config, core *service.CorePublicClient, creds *service.CredentialStore) *AuthHandler {
	return &AuthHandler{cfg: cfg, core: core, creds: creds}
}

// WithSourceThrottle wires the persistent anti-DoS login-source throttle.
func (h *AuthHandler) WithSourceThrottle(t *service.SourceThrottle) *AuthHandler {
	h.throttle = t
	return h
}

// WithRateLimitRequired marks the login-abuse throttle as mandatory. When true
// and no throttle is wired, untrusted logins fail closed rather than run
// unthrottled — the protection can never be silently disabled by a missing
// secret. Production sets this true.
func (h *AuthHandler) WithRateLimitRequired(required bool) *AuthHandler {
	h.requireThrottle = required
	return h
}

// recordUntrustedFailure records one untrusted failed login against the three
// abuse budgets (per source, per target, per source+target) and audits the
// first time a source or target becomes blocked. Never called for a trusted
// device. targetID may be "" (unknown handle → only the source budget).
func (h *AuthHandler) recordUntrustedFailure(r *http.Request, source, targetID string) {
	if blocked, err := h.throttle.RecordFailure(r.Context(),
		service.SourceKey(source), service.ThrottleWindow(), service.CapPerSource(), service.ThrottleBlock()); err == nil && blocked {
		_ = h.creds.WriteAudit(r.Context(), "", "SOURCE_RATE_LIMITED", "login-source", nil)
	}
	if targetID != "" {
		if blocked, err := h.throttle.RecordFailure(r.Context(),
			service.TargetKey(targetID), service.ThrottleWindow(), service.CapPerTarget(), service.ThrottleBlock()); err == nil && blocked {
			_ = h.creds.WriteAudit(r.Context(), targetID, "SOURCE_RATE_LIMITED", targetID, nil)
		}
		_, _ = h.throttle.RecordFailure(r.Context(),
			service.SourceTargetKey(source, targetID), service.ThrottleWindow(), service.CapPerSourceTarget(), service.ThrottleBlock())
	}
}

// WithRecovery wires the verified-email + PIN-recovery subsystem (OTP store +
// mailer). Both must be present for the email-verification and forgot-PIN
// endpoints to be enabled; Change-PIN needs only the mailer (for the security
// notice) and works without the OTP store.
func (h *AuthHandler) WithRecovery(rec *service.ConsumerRecoveryService, mailer *ce.Sender) *AuthHandler {
	h.rec = rec
	h.mailer = mailer
	return h
}

// recoveryEnabled reports whether the OTP-backed flows (email verify, forgot
// PIN) can run: a configured OTP store AND a working mailer.
func (h *AuthHandler) recoveryEnabled() bool {
	return h.rec != nil && h.mailer != nil && h.mailer.Enabled()
}

// hasControlChars reports whether s contains any Unicode control character
// (rejected in user-declared names). Printable Unicode — accents, apostrophes,
// hyphens, marks — is allowed.
func hasControlChars(s string) bool {
	for _, r := range s {
		if unicode.IsControl(r) {
			return true
		}
	}
	return false
}

// POST /v1/auth/register
// Creates a new consumer account. On success, also provisions an AOA wallet.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Handle      string  `json:"handle"`
		DisplayName *string `json:"display_name"`
		Pin         string  `json:"pin"`
		Email       string  `json:"email"`
		// EmailVerificationToken is the opaque grant from POST /v1/auth/email/verify
		// proving the email was OTP-verified. Required when recovery is enabled.
		EmailVerificationToken string `json:"email_verification_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	switch {
	case strings.TrimSpace(body.Handle) == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "handle is required")
		return
	case utf8.RuneCountInString(body.Handle) < 3 || utf8.RuneCountInString(body.Handle) > 30:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD", "handle must be between 3 and 30 characters")
		return
	}
	if err := validateConsumerPin(body.Pin); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD", err.Error())
		return
	}

	// Full name is REQUIRED at the canonical API boundary (ACCOUNT-ONBOARDING-
	// NAME-001) — no target (Web/iOS/Android/direct client) may create a
	// nameless account. It is a user-declared name, NOT identity verification;
	// Sandbox performs no KYC. Unicode-safe: accents, apostrophes, hyphens, and
	// one or many words are all valid; only empty, over-length and control
	// characters are rejected. Casing is preserved (no over-normalisation).
	name := ""
	if body.DisplayName != nil {
		name = strings.TrimSpace(*body.DisplayName)
	}
	switch {
	case name == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "full name is required")
		return
	case utf8.RuneCountInString(name) > 120:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD", "full name is too long")
		return
	case hasControlChars(name):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD", "full name contains invalid characters")
		return
	}

	// A verified email is MANDATORY for every new Consumer account — there is no
	// legacy no-email path. If the email/OTP subsystem is unavailable (no pepper
	// or no working mailer), registration FAILS CLOSED here: no consumer, no
	// credential, no wallet, no financial identity is reserved. The rule lives on
	// the server; an old client that omits email/token cannot bypass it.
	if !h.recoveryEnabled() {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "SIGNUP_UNAVAILABLE",
			"account creation is temporarily unavailable — please try again later")
		return
	}
	email := normalizeEmail(body.Email)
	if email == "" || !looksLikeConsumerEmail(email) {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD", "a valid email is required")
		return
	}
	if strings.TrimSpace(body.EmailVerificationToken) == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "EMAIL_NOT_VERIFIED", "verify your email first")
		return
	}
	// Check the EMAIL_VERIFIED grant is live WITHOUT consuming it yet. Registration
	// is retry-safe: a transient failure during creation leaves the grant usable so
	// the SAME attempt can be retried. The grant is consumed only once creation
	// succeeds; the "1 verified email = 1 live Consumer" unique index guarantees it
	// can never create a second identity even while it stays live across a retry.
	if err := h.rec.CheckEmailVerificationGrantLive(r.Context(), body.EmailVerificationToken, email); err != nil {
		apierror.Respond(w, r, http.StatusForbidden, "EMAIL_NOT_VERIFIED",
			"email verification is invalid or expired — verify again")
		return
	}

	handle := strings.ToLower(strings.TrimSpace(body.Handle))

	// Create the consumer, or RESUME a prior attempt. CreateConsumer binds the
	// verified email (unique among live consumers). A HANDLE_TAKEN/EMAIL_TAKEN can
	// therefore mean a previous attempt of THIS registration already created the
	// account (it holds our verified email) — resume onto it instead of failing.
	consumer, err := h.core.CreateConsumer(r.Context(), handle, &name, email)
	if err != nil {
		if errors.Is(err, service.ErrHandleTaken) || errors.Is(err, service.ErrEmailTaken) {
			id, status, found, lerr := h.creds.ConsumerByEmail(r.Context(), email)
			if lerr == nil && found && status == "ACTIVE" {
				// A prior attempt created this account (same verified email) — resume.
				if existing, gerr := h.core.GetConsumer(r.Context(), id); gerr == nil {
					consumer = existing
				} else {
					consumer = &service.ConsumerRecord{ID: id, Handle: handle}
				}
			} else if errors.Is(err, service.ErrHandleTaken) {
				apierror.Respond(w, r, http.StatusConflict, "HANDLE_TAKEN", "handle is already registered")
				return
			} else {
				apierror.Respond(w, r, http.StatusConflict, "EMAIL_TAKEN", "email is already in use")
				return
			}
		} else {
			// Transient (timeout / 5xx / network): the grant stays live so the same
			// registration can be retried. Nothing was created.
			apierror.Respond(w, r, http.StatusServiceUnavailable, "SIGNUP_RETRY",
				"could not create the account right now — please try again")
			return
		}
	}

	// Credential: idempotent on retry (a prior attempt may have saved it).
	if err := h.creds.Save(r.Context(), consumer.ID, handle, body.Pin); err != nil &&
		!errors.Is(err, service.ErrHandleAlreadyRegistered) {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "SIGNUP_RETRY",
			"could not finish account setup — please try again")
		return
	}

	// Auto-provision an AOA wallet so the consumer can transact immediately
	// (GetOrCreate: idempotent, so a retry never makes a second wallet).
	_, _ = h.core.GetOrCreateWallet(r.Context(), consumer.ID, "AOA")

	// Sandbox-only: grant 10,000 Kz test balance so testers can transact immediately.
	//
	// Case-insensitive for the same reason as the sandbox utilities (RA-051): the
	// deployment sets ENVIRONMENT=sandbox, so an exact match against "SANDBOX"
	// never fired and every consumer registered in the Sandbox started at zero —
	// silently, because a skipped grant looks identical to a grant of nothing.
	if isSandboxEnvironment(h.cfg.Environment) {
		// RA-059: the outcome was discarded (`_, _ =`), so a refused grant was
		// indistinguishable from a successful one — the same silent-zero failure
		// RA-051 produced, reached by a different route. The grant legitimately
		// fails once the Phase-0 pilot funds-in-circulation cap is reached (core
		// answers 422) and registration must still succeed, but the operator has
		// to be able to see it.
		// One grant per consumer, ever: a retried registration must not fund
		// the same account twice.
		if _, err := h.core.SandboxCreditConsumer(r.Context(), consumer.ID, 1_000_000, "AOA", "registration-grant"); err != nil {
			slog.Warn("sandbox registration grant did not apply — consumer starts at zero",
				"consumer_id", consumer.ID, "error", err)
		}
	}

	// The account now fully exists: consume the grant (single-use from here on).
	// Best-effort — a concurrent retry of the same attempt may have consumed it
	// already; the unique email index still guarantees exactly one identity, so a
	// failed consume here is not fatal and is only logged.
	if err := h.rec.ConsumeEmailVerificationGrant(r.Context(), body.EmailVerificationToken, email); err != nil {
		slog.Warn("email verification grant not consumed after successful registration",
			"consumer_id", consumer.ID, "error", err)
	}

	// Issue a token for this device at the credential's current session version
	// (0 for a fresh account; read back so a resumed attempt is correct).
	version, err := h.creds.CurrentTokenVersion(r.Context(), consumer.ID)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not issue token")
		return
	}
	token, expiresAt, err := middleware.NewConsumerToken(
		h.cfg.JWTSecret, consumer.ID, version, []string{"consumer"}, consumerTokenTTL,
	)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not issue token")
		return
	}

	respond(w, http.StatusCreated, map[string]any{
		"consumer":   consumer,
		"token":      token,
		"expires_at": expiresAt,
		"token_type": "Bearer",
	})
}

// POST /v1/auth/token
// Verifies handle+PIN and issues a JWT. The PIN is never returned.
func (h *AuthHandler) Token(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Handle string `json:"handle"`
		Pin    string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	if body.Handle == "" || body.Pin == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "handle and pin are required")
		return
	}

	handle := strings.ToLower(strings.TrimSpace(body.Handle))

	// The device id (SDK X-Device-Id) is used ONLY to decide brute-force
	// escalation and source-throttle applicability — never as a login credential.
	deviceID := strings.TrimSpace(r.Header.Get("X-Device-Id"))
	source := clientIP(r)

	// Deliberate ordering (anti-DoS). A TRUSTED device (one that previously signed
	// into THIS account) is governed solely by the account credential policy
	// (3→lock→3→recovery) and bypasses the untrusted throttle entirely — the
	// intended escalation is never pre-empted, and an untrusted failure never
	// touches the global credential state. An UNTRUSTED source is governed ONLY by
	// the separate persistent throttle across three budgets: per source (password
	// spray), per target (distributed brute force of the 1e6 PIN space), and per
	// source+target. A blocked key refuses the attempt before the credential is
	// read; a trusted login is never refused by these budgets.
	trusted := h.creds.IsTrustedDevice(r.Context(), handle, deviceID)
	var targetID string
	if !trusted {
		if id, ok := h.creds.ConsumerIDByHandle(r.Context(), handle); ok {
			targetID = id
		}
		if h.throttle == nil && h.requireThrottle {
			// The login-abuse throttle is required but unconfigured (missing
			// secret). Never serve an untrusted login unthrottled — fail closed.
			// A trusted device (handled above) is unaffected.
			apierror.Respond(w, r, http.StatusServiceUnavailable, "SECURITY_UNAVAILABLE",
				"login temporarily unavailable")
			return
		}
		if h.throttle != nil {
			keys := []string{service.SourceKey(source)}
			if targetID != "" {
				keys = append(keys, service.TargetKey(targetID), service.SourceTargetKey(source, targetID))
			}
			if blocked, berr := h.throttle.AnyBlocked(r.Context(), keys...); berr == nil && blocked {
				apierror.Respond(w, r, http.StatusTooManyRequests, "TOO_MANY_ATTEMPTS",
					"too many attempts — try again later")
				return
			}
		}
	}

	consumerID, tokenVersion, err := h.creds.VerifyWithDevice(r.Context(), handle, body.Pin, deviceID)
	if err != nil {
		// Count the failure in the untrusted budgets ONLY for an untrusted source.
		// A trusted device must never be throttled out of the account policy, and
		// its failures already drive the credential policy inside Verify.
		if !trusted && h.throttle != nil {
			h.recordUntrustedFailure(r, source, targetID)
		}
		// Trusted-device wrong PIN: return how many attempts remain so the client
		// can show it. Only ever for a real account on a trusted device — unknown
		// handles and untrusted sources fall through to the generic response below,
		// which never discloses a counter.
		var pinErr *service.PinAttemptError
		if errors.As(err, &pinErr) {
			apierror.RespondExtra(w, r, http.StatusUnauthorized, "INVALID_CREDENTIALS",
				"invalid handle or PIN", map[string]any{"remaining_attempts": pinErr.Remaining})
			return
		}
		if errors.Is(err, service.ErrInvalidCredentials) {
			apierror.Respond(w, r, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid handle or PIN")
			return
		}
		if errors.Is(err, service.ErrPinRecoveryRequired) {
			// Three wrong PINs on a trusted device — PIN login is now protected; the
			// person must recover access (Forgot-PIN) to set a new PIN. The consumer
			// stays ACTIVE. remaining_attempts = 0 + recovery_required for the client.
			apierror.RespondExtra(w, r, http.StatusForbidden, "PIN_RECOVERY_REQUIRED",
				"o acesso por PIN foi protegido — redefina o PIN para continuar",
				map[string]any{"remaining_attempts": 0, "recovery_required": true})
			return
		}
		if errors.Is(err, service.ErrTestPayerSignIn) {
			apierror.Respond(w, r, http.StatusForbidden, "TEST_PAYER_SIGN_IN_UNAVAILABLE",
				"a Sandbox test payer pays through its Project's API — POST /v1/sandbox/test-payers/{id}/payments — and does not sign in")
			return
		}
		if errors.Is(err, service.ErrConsumerNotActive) {
			apierror.Respond(w, r, http.StatusForbidden, "ACCOUNT_SUSPENDED",
				"this account is not active")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "authentication failed")
		return
	}

	token, expiresAt, err := middleware.NewConsumerToken(
		h.cfg.JWTSecret, consumerID, tokenVersion, []string{"consumer"}, consumerTokenTTL,
	)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not issue token")
		return
	}

	respond(w, http.StatusOK, map[string]any{
		"token":      token,
		"expires_at": expiresAt,
		"token_type": "Bearer",
	})
}

// POST /v1/auth/logout
// Ends every session the signed-in consumer holds: tokens issued before it
// stop being accepted on the next request. There was no way to end one.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "not signed in")
		return
	}
	if err := h.creds.RevokeSessions(r.Context(), consumer.ID); err != nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE",
			"could not sign out — try again")
		return
	}
	respond(w, http.StatusOK, map[string]any{"signed_out": true})
}

// POST /v1/me/deletion
// Suprimir conta — real, permanent account deletion. This is NOT logout and NOT
// "remover deste dispositivo": it requires a fresh PIN re-auth over the signed-in
// session, then executes the ledger-safe deletion in core (balance swept to
// transit, consumer closed to a tombstone, declared name scrubbed, @banza handle
// retired, device signals removed) and removes this service's credential so no
// future sign-in can succeed.
func (h *AuthHandler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "not signed in")
		return
	}
	var body struct {
		Pin string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Pin) == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "PIN_REQUIRED",
			"confirm the deletion with your PIN")
		return
	}
	// Fresh PIN re-auth over the authenticated session (server-side, over TLS —
	// never by email or a public form). The id is the session's, not the client's.
	if err := h.creds.VerifyPinByID(r.Context(), consumer.ID, body.Pin); err != nil {
		apierror.Respond(w, r, http.StatusForbidden, "REAUTH_REQUIRED", "incorrect PIN")
		return
	}
	// Execute the ledger-safe deletion in core (idempotent, fail-closed).
	if err := h.core.DeleteConsumer(r.Context(), consumer.ID); err != nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE",
			"could not delete the account — try again")
		return
	}
	// Remove this service's credential: no future sign-in, existing sessions
	// invalid. Core has already closed the account (CLOSED blocks auth), so a
	// failure here never leaves the account usable; log and still report success.
	if err := h.creds.DeleteCredential(r.Context(), consumer.ID); err != nil {
		slog.ErrorContext(r.Context(), "account deleted in core but credential removal failed",
			"consumer_id", consumer.ID, "error", err)
	}
	respond(w, http.StatusOK, map[string]any{"deleted": true})
}
