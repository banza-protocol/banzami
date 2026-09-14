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
//	core 503 PROVIDER_UNAVAILABLE → 503 with that code: an external rail the
//	          operation needs is down (ADR-061). It is the caller's outcome to
//	          handle, not a Banzami outage, so it is not collapsed into 502.
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
	if ok && ce.Status == http.StatusServiceUnavailable && ce.Code == "PROVIDER_UNAVAILABLE" {
		w.Header().Set("Retry-After", "30")
		apierror.Respond(w, r, http.StatusServiceUnavailable, "PROVIDER_UNAVAILABLE",
			"the external rail this operation needs is unavailable; nothing was created, credited or confirmed")
		return
	}
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
