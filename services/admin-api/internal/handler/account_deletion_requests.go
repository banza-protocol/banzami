package handler

// Account-deletion requests — the operator surface for the public web
// "supressão de conta" intake (banzami.com/supressao-de-conta).
//
// The api-gateway owns the account_deletion_requests table; this handler is a
// thin, environment-aware passthrough so BANZADMIN can work the queue:
//
//   - review the queue and open a request (CapAccountDeletionReview),
//   - record the ownership verification or reject (CapAccountDeletionReview),
//   - execute the irreversible deletion (CapAccountDeletionExecute, SUPER_ADMIN).
//
// A verified email never deletes an account on its own: an operator records an
// ownership check first (EMAIL_VERIFIED → OPERATOR_REVIEW), and only then may a
// higher authority execute (→ EXECUTED). Both the gateway and a DB CHECK enforce
// that EMAIL_VERIFIED can never jump straight to EXECUTED.

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
)

// GatewayAccountDeletions is the subset of the gateway client this handler calls.
type GatewayAccountDeletions interface {
	ListAccountDeletionRequestsRaw(ctx context.Context, status string) (json.RawMessage, int, error)
	GetAccountDeletionRequestRaw(ctx context.Context, id string) (json.RawMessage, int, error)
	RecordAccountDeletionOwnershipRaw(ctx context.Context, id, operator, result, notes string) (json.RawMessage, int, error)
	RejectAccountDeletionRequestRaw(ctx context.Context, id, operator, reason string) (json.RawMessage, int, error)
	ExecuteAccountDeletionRequestRaw(ctx context.Context, id, operator, requestID string) (json.RawMessage, int, error)
}

// AccountDeletionRequestHandler forwards operator actions to the owning gateway.
type AccountDeletionRequestHandler struct {
	gw        GatewayAccountDeletions
	gwStaging GatewayAccountDeletions // SANDBOX stack; nil when unconfigured
	platform  PlatformModeReader
}

func NewAccountDeletionRequestHandler(gw, gwStaging GatewayAccountDeletions, platform PlatformModeReader) *AccountDeletionRequestHandler {
	return &AccountDeletionRequestHandler{gw: gw, gwStaging: gwStaging, platform: platform}
}

// gatewayForRequest picks the stack. Fail-safe: an unspecified or unreadable
// environment resolves to SANDBOX, so an operator action can never be routed at
// the live stack by accident (deletion is Sandbox-only in effect).
func (h *AccountDeletionRequestHandler) gatewayForRequest(ctx context.Context, environment string) GatewayAccountDeletions {
	env := strings.TrimSpace(environment)
	if env == "" && h.platform != nil {
		if m, err := h.platform.ReadMode(ctx); err == nil {
			env = m
		} else {
			env = "SANDBOX"
		}
	}
	if h.gwStaging != nil && !strings.EqualFold(env, "LIVE") {
		return h.gwStaging
	}
	return h.gw
}

func (h *AccountDeletionRequestHandler) env(r *http.Request) string {
	return r.URL.Query().Get("environment")
}

// GET /admin/v1/account-deletion-requests?status=&environment=
func (h *AccountDeletionRequestHandler) List(w http.ResponseWriter, r *http.Request) {
	raw, code, err := h.gatewayForRequest(r.Context(), h.env(r)).
		ListAccountDeletionRequestsRaw(r.Context(), r.URL.Query().Get("status"))
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "could not reach the request store")
		return
	}
	writeRaw(w, code, raw)
}

// GET /admin/v1/account-deletion-requests/{id}
func (h *AccountDeletionRequestHandler) Get(w http.ResponseWriter, r *http.Request) {
	raw, code, err := h.gatewayForRequest(r.Context(), h.env(r)).
		GetAccountDeletionRequestRaw(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "could not reach the request store")
		return
	}
	writeRaw(w, code, raw)
}

// POST /admin/v1/account-deletion-requests/{id}/record-ownership
// Body: {result: VERIFIED|FAILED, notes?}. The operator is the authenticated
// admin (from the session), never a client-supplied value.
func (h *AccountDeletionRequestHandler) RecordOwnership(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.FromContext(r.Context())
	var body struct {
		Result string `json:"result"`
		Notes  string `json:"notes"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	raw, code, err := h.gatewayForRequest(r.Context(), h.env(r)).
		RecordAccountDeletionOwnershipRaw(r.Context(), chi.URLParam(r, "id"), p.Actor(), body.Result, body.Notes)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "could not record the verification")
		return
	}
	writeRaw(w, code, raw)
}

// POST /admin/v1/account-deletion-requests/{id}/reject
func (h *AccountDeletionRequestHandler) Reject(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.FromContext(r.Context())
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	raw, code, err := h.gatewayForRequest(r.Context(), h.env(r)).
		RejectAccountDeletionRequestRaw(r.Context(), chi.URLParam(r, "id"), p.Actor(), body.Reason)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "could not reject the request")
		return
	}
	writeRaw(w, code, raw)
}

// POST /admin/v1/account-deletion-requests/{id}/execute
// The irreversible step — CapAccountDeletionExecute (SUPER_ADMIN) + step-up.
func (h *AccountDeletionRequestHandler) Execute(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.FromContext(r.Context())
	var body struct {
		RequestID string `json:"request_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	raw, code, err := h.gatewayForRequest(r.Context(), h.env(r)).
		ExecuteAccountDeletionRequestRaw(r.Context(), chi.URLParam(r, "id"), p.Actor(), body.RequestID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "could not execute the deletion")
		return
	}
	writeRaw(w, code, raw)
}
