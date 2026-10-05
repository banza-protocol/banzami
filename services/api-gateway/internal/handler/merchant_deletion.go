package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// MerchantDeletionHandler implements "Suprimir conta Business" — the authenticated
// in-app Business account deletion. It is NOT logout and NOT "remover deste
// dispositivo".
//
// After a fresh PIN re-auth it executes the ledger-safe retire + close in core.
// That is the point of no return: once merchants.status becomes CLOSED, every new
// sign-in is refused regardless of any later cleanup (VerifyHandlePin rejects a
// non-ACTIVE merchant). The session/credential cleanup below is therefore
// best-effort, idempotent defence-in-depth. Developer-project bindings to a CLOSED
// Business are already inert (the business can no longer settle).
type MerchantDeletionHandler struct {
	core     *service.CoreApiClient
	creds    service.MerchantCredentialService
	sessions service.MerchantSessionService
}

func NewMerchantDeletionHandler(core *service.CoreApiClient, creds service.MerchantCredentialService, sessions service.MerchantSessionService) *MerchantDeletionHandler {
	return &MerchantDeletionHandler{core: core, creds: creds, sessions: sessions}
}

// POST /v1/merchant/deletion
func (h *MerchantDeletionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	p, ok := middleware.GetPrincipal(r.Context())
	if !ok || p.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "not signed in as a Business")
		return
	}
	var body struct {
		Pin string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Pin == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "PIN_REQUIRED",
			"confirm the deletion with your PIN")
		return
	}

	// Fresh PIN re-auth over the authenticated session (server-side, over TLS —
	// never by email or a public form). The id is the session's, not the client's.
	if err := h.creds.VerifyPinByMerchantID(r.Context(), p.MerchantID, p.Environment, body.Pin); err != nil {
		apierror.Respond(w, r, http.StatusForbidden, "REAUTH_REQUIRED", "incorrect PIN")
		return
	}

	// Point of no return: ledger-safe retire + close in core (idempotent,
	// fail-closed). Refuses while a settlement is still in flight.
	if err := h.core.DeleteBusiness(r.Context(), p.MerchantID); err != nil {
		if errors.Is(err, service.ErrBusinessDeletionPendingSettlement) {
			apierror.Respond(w, r, http.StatusConflict, "PENDING_SETTLEMENT",
				"a settlement has not finished — try again shortly")
			return
		}
		apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE",
			"could not delete the account — try again")
		return
	}

	// Best-effort, idempotent cleanup of this service's own state. The account is
	// already unusable (CLOSED blocks every sign-in), so a failure here never
	// leaves it recoverable; it is logged for a retry and does not fail the request.
	if h.sessions != nil {
		if err := h.sessions.RevokeAllForMerchant(r.Context(), p.MerchantID, p.Environment); err != nil {
			slog.ErrorContext(r.Context(), "business deleted in core but session revoke-all failed",
				"merchant_id", p.MerchantID, "error", err)
		}
	}
	if err := h.creds.DeleteCredentialByMerchant(r.Context(), p.MerchantID, p.Environment); err != nil {
		slog.ErrorContext(r.Context(), "business deleted in core but credential removal failed",
			"merchant_id", p.MerchantID, "error", err)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"deleted": true})
}
