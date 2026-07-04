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
	// identity:read is implicitly granted to every issued key; the endpoint
	// exposes only the caller's own resolved context.
	writeJSON(w, http.StatusOK, map[string]any{
		"environment":  p.Environment,
		"workspace_id": p.WorkspaceID,
		"project_id":   p.ProjectID,
		"scopes":       p.Scopes,
		"key_id":       p.KeyID,
	})
}
