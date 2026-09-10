package handler

// GET /v1/me — the released developer-key consumption surface (ADR-046).
// Authenticated by a Console-issued Sandbox API key. Returns the resolved
// identity context and nothing else (no financial state). Proves the end-to-end
// path: Console key → Gateway auth → resolved context → public Sandbox API.

import (
	"net/http"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
)

// MeHandler serves the developer identity endpoint.
type MeHandler struct{}

func NewMeHandler() *MeHandler { return &MeHandler{} }

// Me returns the authenticated key's environment, workspace, project and scopes.
func (h *MeHandler) Me(w http.ResponseWriter, r *http.Request) {
	p, ok := middleware.GetDeveloperPrincipal(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}
	// Least-privilege: GET /v1/me requires the identity:read scope (the only
	// scope backed by a released route). A key without it is neutrally denied.
	if !p.HasScope("identity:read") {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "insufficient scope")
		return
	}
	// Public contract: the key's environment, scopes and status, and the Project
	// it belongs to.
	//
	// `project` used to be a single string — the slug — and then briefly a
	// derived `project_id` beside it. Neither let an integration check which
	// Project its key belongs to: the slug is what a developer typed and can
	// retype, and the derived id matched nothing a developer could see anywhere
	// else. The Project's own id is what the Console addresses it by, is stable
	// across renames, and is the developer's to know. So it is the id.
	//
	// What stays out is everything BEHIND the Project: the workspace id, the key
	// id, and the financial owner, wallet and account the Project's binding
	// resolves to. Those are the operator's, and the readiness resource reports
	// their state without naming them.
	writeJSON(w, http.StatusOK, map[string]any{
		"environment": p.Environment,
		"project": map[string]any{
			"id":   p.ProjectID,
			"name": p.ProjectName,
			"ref":  p.ProjectSlug,
		},
		"scopes":     p.Scopes,
		"key_status": p.KeyStatus,
	})
}
