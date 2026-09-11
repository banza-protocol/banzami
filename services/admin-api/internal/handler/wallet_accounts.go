package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// WalletAccountHandler is the operator surface for a Business's segregated
// wallet accounts.
type WalletAccountHandler struct {
	core *service.CoreAdminClient
}

func NewWalletAccountHandler(core *service.CoreAdminClient) *WalletAccountHandler {
	return &WalletAccountHandler{core: core}
}

// Close handles POST /admin/v1/wallet-accounts/{id}/close.
//
// Accounts are never deleted: closing is the end of the lifecycle — the account
// leaves every active list and can no longer receive or send. Core refuses a
// PRIMARY account, a balance, and anything still pending (links, sessions, QR,
// settlements) and records the closure in its audit trail; this records the
// operator's.
func (h *WalletAccountHandler) Close(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Reason) == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "reason is required")
		return
	}
	out, err := h.core.CloseWalletAccount(r.Context(), id, strings.TrimSpace(body.Reason), actorOf(r))
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "wallet_account", id, map[string]any{"action": "CLOSE", "reason": strings.TrimSpace(body.Reason)})
	writeJSON(w, http.StatusOK, out)
}
