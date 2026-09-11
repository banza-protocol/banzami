package handler

import (
	"encoding/json"
	"errors"
	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type DisputeHandler struct {
	core *service.CoreAdminClient
	gw   *service.GatewayClient // owns transaction proofs; flips them to REVERSED
	env  string                 // "LIVE" | "SANDBOX" — this admin instance's environment
}

func NewDisputeHandler(core *service.CoreAdminClient, gw *service.GatewayClient, env string) *DisputeHandler {
	return &DisputeHandler{core: core, gw: gw, env: env}
}

// GET /admin/v1/disputes?merchant_id=&consumer_id=&status=&limit=
func (h *DisputeHandler) List(w http.ResponseWriter, r *http.Request) {
	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			writeError(w, http.StatusBadRequest, "INVALID_PARAM", "limit must be between 1 and 100")
			return
		}
		limit = parsed
	}

	result, err := h.core.ListDisputes(r.Context(),
		r.URL.Query().Get("merchant_id"),
		r.URL.Query().Get("consumer_id"),
		r.URL.Query().Get("status"),
		limit,
	)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// GET /admin/v1/disputes/{id}
func (h *DisputeHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.GetDispute(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "dispute not found")
			return
		}
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// POST /admin/v1/disputes/{id}/resolve
func (h *DisputeHandler) Resolve(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body struct {
		Outcome         string `json:"outcome"`
		ResolutionNotes string `json:"resolution_notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	switch body.Outcome {
	case "WON_BY_CONSUMER", "WON_BY_MERCHANT", "CLOSED":
	default:
		writeError(w, http.StatusBadRequest, "INVALID_OUTCOME", "outcome must be WON_BY_CONSUMER, WON_BY_MERCHANT or CLOSED")
		return
	}
	p, ok := auth.FromContext(r.Context())
	if !ok || p.ID == "" {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "operator session required")
		return
	}

	// Attribution from the authenticated operator (ignores any client value).
	// disputes.resolved_by is the operator's admin user id (a UUID). This sent
	// the e-mail, core refused to parse it, and every resolution failed as a
	// 500 — no dispute could ever be resolved from BANZADMIN.
	result, err := h.core.ResolveDispute(r.Context(), id, body.Outcome, body.ResolutionNotes, p.ID)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "dispute not found")
			return
		}
		var ce *service.CoreError
		if errors.As(err, &ce) && ce.Status >= 400 && ce.Status < 500 {
			writeError(w, ce.Status, ce.Code, ce.Message)
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "the dispute could not be resolved")
		return
	}
	auditAfter(r, "dispute", id, map[string]any{
		"dispute_id":       id,
		"outcome":          body.Outcome,
		"resolution_notes": body.ResolutionNotes,
		"status":           "RESOLVED",
	})

	// WON_BY_CONSUMER reverses the transaction (a dispute-refund ledger movement in
	// core), so its public proof must go REVERSED too. Best-effort + idempotent.
	if body.Outcome == "WON_BY_CONSUMER" && h.gw != nil {
		if txnID, _ := result["transaction_id"].(string); txnID != "" {
			if err := h.gw.ReverseProof(r.Context(), txnID, h.env); err != nil {
				slog.ErrorContext(r.Context(), "proof.reverse.failed", "transaction_id", txnID, "dispute_id", id, "error", err)
			} else {
				slog.InfoContext(r.Context(), "proof.reversed", "transaction_id", txnID, "cause", "dispute_won_by_consumer")
			}
		}
	}

	writeJSON(w, http.StatusOK, result)
}
