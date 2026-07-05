package developer

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/common/obs"
	"github.com/banzami/banzami/services/developer-api/internal/accountidentity"
	"github.com/banzami/banzami/services/developer-api/internal/httpx"
)

// Handlers is the Developer HTTP surface. All routes run behind the Account
// Identity session guard; mutations additionally behind Origin + CSRF (applied
// by the caller via Mount).
type Handlers struct{ svc *Service }

func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// MountInternal registers the service-to-service /internal routes (ADR-046).
// The parent must guard these with a shared internal key. The raw key is read
// from the request body, verified, and never logged or echoed.
func (h *Handlers) MountInternal(r chi.Router) {
	r.Post("/internal/v1/keys/authorize", h.authorizeKey)
	// Operator-controlled Project→Merchant binding (ADR-047). Guarded by the same
	// shared internal key; NOT a public self-service route. The caller (operator
	// tooling) provisions the Sandbox merchant + wallet in Core first, then binds.
	r.Post("/internal/v1/projects/{projID}/binding", h.bindProjectSandbox)
	// Operator-controlled E2E fixture key with payment scopes (RT04C §1). The ONLY
	// way payment scopes reach a key before public release — for isolated E2E
	// fixtures. Internal-key guarded; not public self-service.
	r.Post("/internal/v1/projects/{projID}/fixture-keys", h.createFixtureKey)
}

// createFixtureKey issues an operator-controlled fixture key that may carry
// payment scopes while the capability is unreleased. Body:
// {"name","scopes":[...],"created_by"}. The raw secret is returned once and is
// never logged.
func (h *Handlers) createFixtureKey(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name      string   `json:"name"`
		Scopes    []string `json:"scopes"`
		CreatedBy string   `json:"created_by"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "VALIDATION", "invalid request")
		return
	}
	ip, rid := reqMeta(r)
	key, secret, err := h.svc.CreateFixtureAPIKey(r.Context(), chi.URLParam(r, "projID"), in.Name, in.Scopes, in.CreatedBy, ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	resp := keyView(key)
	resp["secret"] = secret // reveal-once
	httpx.JSON(w, http.StatusCreated, resp)
}

// bindProjectSandbox records an operator-provisioned SANDBOX payee binding for a
// project. Body: {"merchant_id","wallet_id","wallet_account_id","actor_user_id"}.
// All ids are opaque core ids the operator already created. One ACTIVE binding
// per project (409 on conflict). Never accepts or trusts a client-supplied
// project payee for a payment — this only records the operator's binding.
func (h *Handlers) bindProjectSandbox(w http.ResponseWriter, r *http.Request) {
	var in struct {
		MerchantID      string `json:"merchant_id"`
		WalletID        string `json:"wallet_id"`
		WalletAccountID string `json:"wallet_account_id"`
		ActorUserID     string `json:"actor_user_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "VALIDATION", "invalid request")
		return
	}
	ip, rid := reqMeta(r)
	b, err := h.svc.BindProjectSandbox(r.Context(), chi.URLParam(r, "projID"),
		in.MerchantID, in.WalletID, in.WalletAccountID, in.ActorUserID, ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{
		"binding_id": b.ID, "project_id": b.ProjectID, "state": b.State,
		"artifact_created": b.ArtifactCreated, "created_at": b.CreatedAt,
	})
}

// authorizeKey delegates external developer-key verification for the Gateway.
// POST body: {"api_key": "bz_test_sk_..."}. Returns the resolved context or a
// neutral 403. No raw secret is logged or returned.
func (h *Handlers) authorizeKey(w http.ResponseWriter, r *http.Request) {
	var in struct {
		APIKey string `json:"api_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.APIKey == "" {
		httpx.Error(w, http.StatusBadRequest, "VALIDATION", "invalid request")
		return
	}
	res, err := h.svc.IntrospectKey(r.Context(), in.APIKey)
	if err != nil {
		httpx.Error(w, http.StatusForbidden, "FORBIDDEN", "invalid key")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// Mount registers the developer routes. The parent router must already apply the
// session guard (RequireAuth). `csrf` wraps state-changing routes with Origin +
// CSRF enforcement.
func (h *Handlers) Mount(r chi.Router, csrf func(http.Handler) http.Handler) {
	r.Get("/workspaces", h.listWorkspaces)
	r.Get("/workspaces/{wsID}", h.getWorkspace)
	r.Get("/workspaces/{wsID}/members", h.listMembers)
	r.Get("/workspaces/{wsID}/projects", h.listProjects)
	r.Get("/projects/{projID}", h.getProject)
	r.Get("/projects/{projID}/keys", h.listKeys)

	r.Group(func(r chi.Router) {
		r.Use(csrf)
		r.Post("/workspaces", h.createWorkspace)
		r.Post("/workspaces/{wsID}/members", h.inviteMember)
		r.Patch("/workspaces/{wsID}/members/{userID}", h.setMemberRole)
		r.Delete("/workspaces/{wsID}/members/{userID}", h.removeMember)
		r.Delete("/workspaces/{wsID}/invites/{inviteID}", h.revokeInvite)
		r.Post("/invites/accept", h.acceptInvite)
		r.Post("/workspaces/{wsID}/projects", h.createProject)
		r.Post("/projects/{projID}/keys", h.createKey)
		r.Post("/keys/{keyID}/rotate", h.rotateKey)
		r.Delete("/keys/{keyID}", h.revokeKey)
	})
}

// actor pulls the authenticated Account Identity user out of the request context.
func actor(r *http.Request) (accountidentity.User, bool) { return accountidentity.UserFrom(r.Context()) }

func reqMeta(r *http.Request) (ip, reqID string) { return realIP(r), obs.RequestID(r.Context()) }

func body(r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 8192))
	dec.DisallowUnknownFields()
	return dec.Decode(v) == nil
}

// mapErr translates domain errors to HTTP status + stable code.
func mapErr(w http.ResponseWriter, err error) {
	switch err {
	case ErrForbidden:
		httpx.Error(w, http.StatusForbidden, "FORBIDDEN", "not allowed")
	case ErrNotFound:
		httpx.Error(w, http.StatusNotFound, "NOT_FOUND", "not found")
	case ErrConflict:
		httpx.Error(w, http.StatusConflict, "CONFLICT", "already exists")
	case ErrValidation:
		httpx.Error(w, http.StatusBadRequest, "VALIDATION", "invalid input")
	case ErrLastOwner:
		httpx.Error(w, http.StatusConflict, "LAST_OWNER", "cannot remove or demote the last owner")
	case ErrInviteState:
		httpx.Error(w, http.StatusGone, "INVITE_INVALID", "invite is expired, revoked or already used")
	default:
		httpx.Error(w, http.StatusServiceUnavailable, "UNAVAILABLE", "service unavailable")
	}
}

// ── workspaces ───────────────────────────────────────────────────────────────

func (h *Handlers) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	ws, err := h.svc.ListWorkspaces(r.Context(), u.ID)
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"workspaces": workspaceViews(ws)})
}

func (h *Handlers) createWorkspace(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	var in struct {
		Name string `json:"name"`
	}
	if !body(r, &in) {
		mapErr(w, ErrValidation)
		return
	}
	ip, rid := reqMeta(r)
	ws, err := h.svc.CreateWorkspace(r.Context(), u.ID, in.Name, ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, workspaceView(ws))
}

func (h *Handlers) getWorkspace(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	ws, err := h.svc.GetWorkspace(r.Context(), u.ID, chi.URLParam(r, "wsID"))
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, workspaceView(ws))
}

// ── members / invites ────────────────────────────────────────────────────────

func (h *Handlers) listMembers(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	ms, err := h.svc.ListMembers(r.Context(), u.ID, chi.URLParam(r, "wsID"))
	if err != nil {
		mapErr(w, err)
		return
	}
	out := make([]map[string]any, 0, len(ms))
	for _, m := range ms {
		out = append(out, map[string]any{"user_id": m.UserID, "role": m.Role, "status": m.Status})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"members": out})
}

func (h *Handlers) inviteMember(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	var in struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if !body(r, &in) {
		mapErr(w, ErrValidation)
		return
	}
	ip, rid := reqMeta(r)
	inv, token, err := h.svc.InviteMember(r.Context(), u.ID, chi.URLParam(r, "wsID"), in.Email, in.Role, ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	// token is returned once so the console can build the invite link.
	httpx.JSON(w, http.StatusCreated, map[string]any{"invite_id": inv.ID, "email": inv.Email, "role": inv.Role, "token": token})
}

func (h *Handlers) acceptInvite(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	var in struct {
		Token string `json:"token"`
	}
	if !body(r, &in) {
		mapErr(w, ErrValidation)
		return
	}
	ip, rid := reqMeta(r)
	m, err := h.svc.AcceptInvite(r.Context(), u.ID, u.Email, in.Token, ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"workspace_id": m.WorkspaceID, "role": m.Role})
}

func (h *Handlers) setMemberRole(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	var in struct {
		Role string `json:"role"`
	}
	if !body(r, &in) {
		mapErr(w, ErrValidation)
		return
	}
	ip, rid := reqMeta(r)
	if err := h.svc.SetMemberRole(r.Context(), u.ID, chi.URLParam(r, "wsID"), chi.URLParam(r, "userID"), in.Role, ip, rid); err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handlers) removeMember(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	ip, rid := reqMeta(r)
	if err := h.svc.RemoveMember(r.Context(), u.ID, chi.URLParam(r, "wsID"), chi.URLParam(r, "userID"), ip, rid); err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handlers) revokeInvite(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	ip, rid := reqMeta(r)
	if err := h.svc.RevokeInvite(r.Context(), u.ID, chi.URLParam(r, "wsID"), chi.URLParam(r, "inviteID"), ip, rid); err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ── projects ─────────────────────────────────────────────────────────────────

func (h *Handlers) listProjects(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	ps, err := h.svc.ListProjects(r.Context(), u.ID, chi.URLParam(r, "wsID"))
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"projects": projectViews(ps)})
}

func (h *Handlers) createProject(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	var in struct {
		Name string `json:"name"`
	}
	if !body(r, &in) {
		mapErr(w, ErrValidation)
		return
	}
	ip, rid := reqMeta(r)
	p, err := h.svc.CreateProject(r.Context(), u.ID, chi.URLParam(r, "wsID"), in.Name, ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, projectView(p))
}

func (h *Handlers) getProject(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	p, err := h.svc.GetProject(r.Context(), u.ID, chi.URLParam(r, "projID"))
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, projectView(p))
}

// ── api keys ─────────────────────────────────────────────────────────────────

func (h *Handlers) listKeys(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	ks, err := h.svc.ListAPIKeys(r.Context(), u.ID, chi.URLParam(r, "projID"))
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"keys": keyViews(ks)})
}

func (h *Handlers) createKey(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	var in struct {
		Kind   string   `json:"kind"`
		Name   string   `json:"name"`
		Scopes []string `json:"scopes"`
	}
	if !body(r, &in) {
		mapErr(w, ErrValidation)
		return
	}
	ip, rid := reqMeta(r)
	key, secret, err := h.svc.CreateAPIKey(r.Context(), u.ID, chi.URLParam(r, "projID"), in.Kind, in.Name, in.Scopes, ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	resp := keyView(key)
	if secret != "" {
		resp["secret"] = secret // reveal-once
	}
	httpx.JSON(w, http.StatusCreated, resp)
}

func (h *Handlers) rotateKey(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	ip, rid := reqMeta(r)
	key, secret, err := h.svc.RotateAPIKey(r.Context(), u.ID, chi.URLParam(r, "keyID"), ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	resp := keyView(key)
	if secret != "" {
		resp["secret"] = secret
	}
	httpx.JSON(w, http.StatusOK, resp)
}

func (h *Handlers) revokeKey(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	ip, rid := reqMeta(r)
	if err := h.svc.RevokeAPIKey(r.Context(), u.ID, chi.URLParam(r, "keyID"), ip, rid); err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ── views (never expose secrets/hashes) ──────────────────────────────────────

func workspaceView(w Workspace) map[string]any {
	return map[string]any{"id": w.ID, "name": w.Name, "slug": w.Slug, "status": w.Status, "created_at": w.CreatedAt}
}
func workspaceViews(ws []Workspace) []map[string]any {
	out := make([]map[string]any, 0, len(ws))
	for _, w := range ws {
		out = append(out, workspaceView(w))
	}
	return out
}
func projectView(p Project) map[string]any {
	return map[string]any{"id": p.ID, "workspace_id": p.WorkspaceID, "name": p.Name, "slug": p.Slug, "status": p.Status, "created_at": p.CreatedAt}
}
func projectViews(ps []Project) []map[string]any {
	out := make([]map[string]any, 0, len(ps))
	for _, p := range ps {
		out = append(out, projectView(p))
	}
	return out
}
func keyView(k APIKey) map[string]any {
	return map[string]any{
		"id": k.ID, "project_id": k.ProjectID, "environment": k.Environment, "kind": k.Kind,
		"name": k.Name, "prefix": k.KeyPrefix, "public_value": k.PublicValue, "scopes": k.Scopes,
		"status": k.Status, "created_at": k.CreatedAt, "last_used_at": k.LastUsedAt,
	}
}
func keyViews(ks []APIKey) []map[string]any {
	out := make([]map[string]any, 0, len(ks))
	for _, k := range ks {
		out = append(out, keyView(k))
	}
	return out
}

// realIP prefers the left-most X-Forwarded-For, else RemoteAddr host.
func realIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		for i := 0; i < len(xff); i++ {
			if xff[i] == ',' {
				return trim(xff[:i])
			}
		}
		return trim(xff)
	}
	host := r.RemoteAddr
	for i := len(host) - 1; i >= 0; i-- {
		if host[i] == ':' {
			return host[:i]
		}
	}
	return host
}
func trim(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}
