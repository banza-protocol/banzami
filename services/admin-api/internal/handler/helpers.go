package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
	"github.com/banzami/banzami/services/common/env"
)

// actorOf returns the authenticated operator's email for audit / reviewed_by.
// The JWT middleware always sets the principal on protected routes.
func actorOf(r *http.Request) string {
	if p, ok := auth.FromContext(r.Context()); ok {
		return p.Actor()
	}
	return ""
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}

// handleCoreErr forwards an error from a CoreAdminClient call to the HTTP
// response. A functional error from core-api (a *CoreError) is forwarded with
// its exact status code + `{error:{code,message}}` payload — a 400/401/403/404/
// 409/422/429 stays itself, never masked as 500. Only genuine internal failures
// (transport, decode, unexpected) become a 500.
//
// The TEXT of a failure is never forwarded (A6-11): a transport error names
// core's internal address ("dial tcp …"), and a core 5xx message can be core's
// own database error. Both are logged here and answered with a stable code and a
// generic message. A core 4xx message is core's curated reason and still passes.
func handleCoreErr(w http.ResponseWriter, err error) {
	var ce *service.CoreError
	if errors.As(err, &ce) {
		code := ce.Code
		if code == "" {
			code = "ERROR"
		}
		if ce.Status >= http.StatusInternalServerError {
			slog.Error("admin.core_call.upstream_failed", "status", ce.Status, "code", code, "error", err)
			writeError(w, ce.Status, code, internalErrorMessage)
			return
		}
		writeError(w, ce.Status, code, ce.Message)
		return
	}
	// Backstop: anything still tagged not-found (e.g. a wrapped sentinel) → 404.
	if errors.Is(err, service.ErrNotFound) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "resource not found")
		return
	}
	slog.Error("admin.core_call.failed", "error", err)
	writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", internalErrorMessage)
}

// internalErrorMessage is the whole of what an operator is told about a failure
// that is not a decision: the detail is in the log, under the same request.
const internalErrorMessage = "the request could not be completed; try again"

// actorIsSuperAdmin reports whether the calling operator is a SUPER_ADMIN.
func actorIsSuperAdmin(r *http.Request) bool {
	p, ok := auth.FromContext(r.Context())
	return ok && p.Role == "SUPER_ADMIN"
}

// mayActOnOperator guards account-recovery actions (password reset, invite
// resend, session termination) held by the help desk (operator.reset).
//
// SUPPORT held operator.reset on ANY target, and with e-mail in dry-run the
// reset or invite link came back in the response — so SUPPORT could set the
// password of an invited SUPER_ADMIN, enrol its own MFA and hold the account.
// A recovery action on a SUPER_ADMIN account is itself a SUPER_ADMIN action.
func mayActOnOperator(w http.ResponseWriter, r *http.Request, targetRole string) bool {
	if targetRole == "SUPER_ADMIN" && !actorIsSuperAdmin(r) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "only a SUPER_ADMIN may act on a SUPER_ADMIN account")
		return false
	}
	return true
}

// requestedEnvironment reads ?environment= strictly (A2-22).
//
//	absent          → Live (the console sends no parameter for Live)
//	SANDBOX / LIVE  → that environment, in any case, trimmed (env.Parse)
//	anything else   → 400 INVALID_ENVIRONMENT, and no pool is reached
//
// The review handlers compared the raw value with "SANDBOX" and sent anything
// else — "sandbox", "SANDBOX ", "SANDBX" — to the primary (Live) pool: an
// operator who asked for the Sandbox queue and mistyped it acted on Live.
func requestedEnvironment(w http.ResponseWriter, r *http.Request) (env.Environment, bool) {
	q := r.URL.Query()
	if !q.Has("environment") {
		return env.Live, true
	}
	e := env.Parse(q.Get("environment"))
	if !e.IsKnown() {
		writeError(w, http.StatusBadRequest, "INVALID_ENVIRONMENT", "environment must be LIVE or SANDBOX")
		return env.Unknown, false
	}
	return e, true
}
