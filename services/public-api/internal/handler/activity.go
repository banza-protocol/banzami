package handler

import (
	"context"
	"net/http"
	"strconv"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// activityFetcher is satisfied by *service.CorePublicClient and by test fakes.
type activityFetcher interface {
	GetActivity(
		ctx             context.Context,
		consumerID      string,
		limit           int,
		cursor          string,
		typeFilter      string,
		directionFilter string,
	) (*service.ActivityPage, error)
}

// ActivityHandler handles GET /v1/me/activity.
type ActivityHandler struct {
	core activityFetcher
}

// NewActivityHandler wires the handler for production use.
func NewActivityHandler(core *service.CorePublicClient) *ActivityHandler {
	return &ActivityHandler{core: core}
}

// newActivityHandlerWithFakes is used in tests to inject a mock.
func newActivityHandlerWithFakes(core activityFetcher) *ActivityHandler {
	return &ActivityHandler{core: core}
}

// GET /v1/me/activity
//
// Returns the authenticated consumer's activity feed — a time-ordered,
// cursor-paginated view of all ledger-backed financial events:
// P2P transfers sent and received, wallet fundings, and reversals.
//
// Query params:
//   - cursor  — opaque pagination token from previous response
//   - limit   — page size (1–100, default 20)
//   - type    — filter: P2P_SENT | P2P_RECEIVED | MERCHANT_PAYMENT_SENT |
//               WALLET_FUNDED | WALLET_REVERSED
//   - direction — filter: OUTGOING | INCOMING
func (h *ActivityHandler) Activity(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "limit must be between 1 and 100")
			return
		}
		limit = parsed
	}

	cursor      := r.URL.Query().Get("cursor")
	typeFilter  := r.URL.Query().Get("type")
	dirFilter   := r.URL.Query().Get("direction")

	page, err := h.core.GetActivity(r.Context(), consumer.ID, limit, cursor, typeFilter, dirFilter)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch activity")
		return
	}

	respond(w, http.StatusOK, page)
}
