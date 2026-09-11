package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/config"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

const consumerTokenTTL = 24 * time.Hour

// AuthHandler handles consumer registration and token issuance.
type AuthHandler struct {
	cfg   *config.Config
	core  *service.CorePublicClient
	creds *service.CredentialStore
}

func NewAuthHandler(cfg *config.Config, core *service.CorePublicClient, creds *service.CredentialStore) *AuthHandler {
	return &AuthHandler{cfg: cfg, core: core, creds: creds}
}

// POST /v1/auth/register
// Creates a new consumer account. On success, also provisions an AOA wallet.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Handle      string  `json:"handle"`
		DisplayName *string `json:"display_name"`
		Pin         string  `json:"pin"`
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
	case len(body.Pin) < 4 || len(body.Pin) > 8:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_FIELD", "pin must be between 4 and 8 digits")
		return
	}

	handle := strings.ToLower(strings.TrimSpace(body.Handle))

	consumer, err := h.core.CreateConsumer(r.Context(), handle, body.DisplayName)
	if err != nil {
		if errors.Is(err, service.ErrHandleTaken) {
			apierror.Respond(w, r, http.StatusConflict, "HANDLE_TAKEN", "handle is already registered")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not create account")
		return
	}

	if err := h.creds.Save(r.Context(), consumer.ID, handle, body.Pin); err != nil {
		if errors.Is(err, service.ErrHandleAlreadyRegistered) {
			apierror.Respond(w, r, http.StatusConflict, "HANDLE_TAKEN", "handle is already registered")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not save credentials")
		return
	}

	// Auto-provision an AOA wallet so the consumer can transact immediately.
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

	token, expiresAt, err := middleware.NewConsumerToken(
		h.cfg.JWTSecret, consumer.ID, []string{"consumer"}, consumerTokenTTL,
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

	consumerID, err := h.creds.Verify(r.Context(), handle, body.Pin)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			apierror.Respond(w, r, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid handle or PIN")
			return
		}
		if errors.Is(err, service.ErrCredentialsLocked) {
			apierror.Respond(w, r, http.StatusTooManyRequests, "TOO_MANY_ATTEMPTS",
				"too many wrong PINs — try again in 15 minutes")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "authentication failed")
		return
	}

	token, expiresAt, err := middleware.NewConsumerToken(
		h.cfg.JWTSecret, consumerID, []string{"consumer"}, consumerTokenTTL,
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
