package handler

import (
	"net/http"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// respondCoreError translates a failure from core-api into the public response,
// keeping the three classes distinct instead of collapsing them into 502.
//
//	core 4xx  → that status, with core's own safe reason code
//	core 5xx  → 502 UPSTREAM_ERROR
//	transport → 502 UPSTREAM_ERROR
//
// The public envelope is unchanged: the same apierror shape, correlation id and
// safe message the API already returns. Core's code/message are forwarded ONLY
// because core produces a curated safe envelope; the raw upstream body is never
// carried this far (see service.CoreError).
//
// fallbackMsg is used whenever core supplied no message of its own, so the caller
// always gets something meaningful rather than an empty string.
func respondCoreError(w http.ResponseWriter, r *http.Request, err error, fallbackMsg string) {
	ce, ok := service.AsCoreError(err)
	if !ok || !ce.IsClientError() {
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", fallbackMsg)
		return
	}
	code := ce.Code
	if code == "" {
		code = "INVALID_REQUEST"
	}
	msg := ce.Message
	if msg == "" {
		msg = fallbackMsg
	}
	apierror.Respond(w, r, ce.Status, code, msg)
}
