package developer

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/common/clientip"
	"github.com/banzami/banzami/services/common/obs"
	"github.com/banzami/banzami/services/developer-api/internal/accountidentity"
	"github.com/banzami/banzami/services/developer-api/internal/gatewayclient"
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
	// Operator-controlled E2E fixture platform (workspace + project). The ONLY way
	// to mint a synthetic platform/integrator Project without a Console session —
	// for isolated Sandbox/Phase-0 fixtures. Hard sandbox-gated + internal-key
	// guarded. The platform holds no money and issues no receipts.
	r.Post("/internal/v1/fixture-projects", h.createFixtureProject)
	// Operator-controlled E2E fixture key revocation — the revoke counterpart to
	// fixture-keys, so the revoked-key rejection path can be proven end-to-end.
	// Hard sandbox-gated + internal-key guarded.
	r.Post("/internal/v1/fixture-keys/{keyID}/revoke", h.revokeFixtureKey)
	// Operator-controlled E2E fixture project retirement — the disposal
	// counterpart to fixture-projects, so a harness can retire what it created
	// instead of leaving a live project behind. Archives the project, revokes its
	// remaining ACTIVE keys, and disables an UNSEALED binding; a SEALED binding is
	// immutable (ADR-055) and is left as the record it is.
	r.Post("/internal/v1/fixture-projects/{projID}/retire", h.retireFixtureProject)
	// The same retirement for a project that is NOT a fixture, with a reason that
	// is recorded as given. Retiring a real project through the fixture route
	// would audit it as an e2e fixture, and an audit trail that says the wrong
	// thing about why authority was removed is worse than none.
	r.Post("/internal/v1/projects/{projID}/retire", h.retireProject)
}

// retireProject archives a project, revokes its keys and disables an unsealed
// binding. Body: {"reason" (required), "created_by"}.
func (h *Handlers) retireProject(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Reason    string `json:"reason"`
		CreatedBy string `json:"created_by"`
	}
	_ = body(r, &in)
	ip, rid := reqMeta(r)
	revoked, err := h.svc.RetireProject(r.Context(), chi.URLParam(r, "projID"), in.CreatedBy, in.Reason, ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "status": "ARCHIVED", "keys_revoked": revoked})
}

// retireFixtureProject archives a disposable fixture project and revokes the
// keys still live on it. Body (optional): {"created_by"}.
func (h *Handlers) retireFixtureProject(w http.ResponseWriter, r *http.Request) {
	var in struct {
		CreatedBy string `json:"created_by"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&in)
	ip, rid := reqMeta(r)
	revoked, err := h.svc.RetireFixtureProject(r.Context(), chi.URLParam(r, "projID"), in.CreatedBy, ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "status": "ARCHIVED", "keys_revoked": revoked})
}

// revokeFixtureKey revokes a fixture API key by id for isolated Sandbox E2E.
// Body (optional): {"created_by"}.
func (h *Handlers) revokeFixtureKey(w http.ResponseWriter, r *http.Request) {
	var in struct {
		CreatedBy string `json:"created_by"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&in)
	ip, rid := reqMeta(r)
	if err := h.svc.RevokeFixtureKey(r.Context(), chi.URLParam(r, "keyID"), in.CreatedBy, ip, rid); err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "status": "REVOKED"})
}

// createFixtureProject provisions a synthetic platform/integrator (workspace +
// project) for isolated Sandbox E2E fixtures. Body: {"name","created_by"}.
func (h *Handlers) createFixtureProject(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name      string `json:"name"`
		CreatedBy string `json:"created_by"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "VALIDATION", "invalid request")
		return
	}
	ip, rid := reqMeta(r)
	ws, proj, err := h.svc.CreateFixtureProject(r.Context(), in.Name, in.CreatedBy, ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{
		"workspace_id": ws.ID,
		"project_id":   proj.ID,
		"slug":         proj.Slug,
		"status":       proj.Status,
		"created_at":   proj.CreatedAt,
	})
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
		// "PUBLISHABLE" mints a client key; anything else mints a secret one.
		Kind string `json:"kind"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "VALIDATION", "invalid request")
		return
	}
	ip, rid := reqMeta(r)
	key, secret, err := h.svc.CreateFixtureAPIKey(r.Context(), chi.URLParam(r, "projID"), in.Name, in.Scopes, in.CreatedBy, ip, rid, in.Kind)
	if err != nil {
		mapErr(w, err)
		return
	}
	resp := keyView(key)
	// A publishable key has no secret half: its full value is the public value.
	if key.Kind == KindPublishable {
		resp["secret"] = key.PublicValue
	} else {
		resp["secret"] = secret // reveal-once
	}
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
		// Supersede corrects an existing binding instead of conflicting with it.
		// Opt-in, so the default stays fail-closed: a caller that means to bind
		// a fresh project cannot silently replace a payee by omission.
		Supersede bool `json:"supersede"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "VALIDATION", "invalid request")
		return
	}
	ip, rid := reqMeta(r)
	var (
		b          SandboxBinding
		superseded string
		err        error
	)
	if in.Supersede {
		b, superseded, err = h.svc.RebindProjectSandbox(r.Context(), chi.URLParam(r, "projID"),
			in.MerchantID, in.WalletID, in.WalletAccountID, in.ActorUserID, ip, rid)
	} else {
		b, err = h.svc.BindProjectSandbox(r.Context(), chi.URLParam(r, "projID"),
			in.MerchantID, in.WalletID, in.WalletAccountID, in.ActorUserID, ip, rid)
	}
	if err != nil {
		mapErr(w, err)
		return
	}
	out := map[string]any{
		"binding_id": b.ID, "project_id": b.ProjectID, "state": b.State,
		"artifact_created": b.ArtifactCreated, "created_at": b.CreatedAt,
	}
	if superseded != "" {
		out["superseded_binding_id"] = superseded
	}
	httpx.JSON(w, http.StatusCreated, out)
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
	r.Get("/workspaces/{wsID}/invites", h.listInvites)
	r.Get("/workspaces/{wsID}/projects", h.listProjects)
	r.Get("/projects/{projID}", h.getProject)
	r.Get("/projects/{projID}/keys", h.listKeys)
	r.Get("/projects/{projID}/balances", h.listBalances)
	r.Get("/projects/{projID}/transactions", h.listTransactions)
	r.Get("/projects/{projID}/refund-capability", h.refundCapability)
	r.Get("/projects/{projID}/financial-setup", h.financialSetup)
	// The public purpose list, served rather than duplicated. The Console used to
	// carry its own copy and it drifted immediately — it offered one Core does
	// not accept and withheld several Core does. A list that exists twice is a
	// list that disagrees with itself.
	r.Get("/wallet-account-purposes", h.walletAccountPurposes)
	r.Get("/projects/{projID}/webhooks/endpoints", h.listWebhookEndpoints)
	r.Get("/projects/{projID}/webhooks/events", h.listWebhookEvents)
	r.Get("/projects/{projID}/webhooks/events/{eventID}/deliveries", h.listWebhookDeliveries)
	r.Get("/projects/{projID}/logs", h.listAPIRequestLogs)
	r.Get("/projects/{projID}/footprint", h.projectFootprint)
	r.Get("/workspaces/{wsID}/footprint", h.workspaceFootprint)

	r.Group(func(r chi.Router) {
		r.Use(csrf)
		r.Post("/workspaces", h.createWorkspace)
		r.Patch("/workspaces/{wsID}", h.renameWorkspace)
		r.Delete("/workspaces/{wsID}", h.deleteWorkspace)
		r.Post("/workspaces/{wsID}/archive", h.archiveWorkspace)
		r.Post("/workspaces/{wsID}/leave", h.leaveWorkspace)
		r.Patch("/projects/{projID}", h.renameProject)
		r.Delete("/projects/{projID}", h.deleteProject)
		r.Post("/projects/{projID}/archive", h.archiveProjectByOwner)
		r.Delete("/projects/{projID}/webhooks/endpoints/{epID}", h.deleteWebhookEndpoint)
		r.Post("/projects/{projID}/webhooks/deliveries/{deliveryID}/replay", h.replayWebhookDelivery)
		r.Post("/workspaces/{wsID}/members", h.inviteMember)
		r.Patch("/workspaces/{wsID}/members/{userID}", h.setMemberRole)
		r.Delete("/workspaces/{wsID}/members/{userID}", h.removeMember)
		r.Delete("/workspaces/{wsID}/invites/{inviteID}", h.revokeInvite)
		r.Post("/invites/accept", h.acceptInvite)
		r.Post("/workspaces/{wsID}/projects", h.createProject)
		r.Post("/projects/{projID}/keys", h.createKey)
		r.Post("/keys/{keyID}/rotate", h.rotateKey)
		r.Delete("/keys/{keyID}", h.revokeKey)
		r.Post("/projects/{projID}/payments/{payID}/refund", h.refundPayment)
		r.Post("/projects/{projID}/financial-setup", h.configureFinancialSetup)
		r.Post("/projects/{projID}/financial-onboarding/applications", h.submitFinancialApplication)
		r.Post("/projects/{projID}/financial-onboarding/link", h.linkExistingBusiness)
		r.Post("/projects/{projID}/wallet-accounts", h.createWalletAccount)
		r.Post("/projects/{projID}/webhooks/endpoints", h.createWebhookEndpoint)
		r.Post("/projects/{projID}/webhooks/endpoints/{epID}/rotate-secret", h.rotateWebhookSecret)
		r.Patch("/projects/{projID}/webhooks/endpoints/{epID}", h.setWebhookEndpointActive)
	})
}

// GET /projects/{projID}/balances?limit=&cursor=
//
// The wallet accounts of the merchant this project is bound to, with what each
// one holds. Project-scoped by derivation, read-only, and paged — a project can
// hold hundreds of campaign accounts, and returning all of them because the
// first page happened to be small is how a list becomes a download.
func (h *Handlers) listBalances(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	f := WalletAccountFilter{Cursor: r.URL.Query().Get("cursor")}
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil {
		f.Limit = n
	}
	accounts, total, err := h.svc.ProjectBalances(r.Context(), u.ID, chi.URLParam(r, "projID"), f)
	if err != nil {
		mapErr(w, err)
		return
	}
	// The cursor is the last row's id; absent when the page did not fill, which
	// is the only honest signal that there is nothing after it.
	next := ""
	if f.Limit > 0 && len(accounts) == f.Limit {
		next = accounts[len(accounts)-1].ID
	} else if f.Limit == 0 && len(accounts) == 50 {
		next = accounts[len(accounts)-1].ID
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"accounts": accounts, "total": total, "next_cursor": next,
	})
}

// GET /projects/{projID}/transactions?type=&status=&since=&until=&cursor=&limit=
//
// Every filter is applied in SQL. Filtering a capped page in the browser
// answers a different question from the one the user asked — and answers it
// wrongly the moment there is more history than one page.
func (h *Handlers) listTransactions(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	q := r.URL.Query()
	f := TransactionFilter{
		Cursor: q.Get("cursor"),
		Type:   q.Get("type"),
		Status: q.Get("status"),
	}
	if n, err := strconv.Atoi(q.Get("limit")); err == nil {
		f.Limit = n
	}
	if t, err := time.Parse(time.RFC3339, q.Get("since")); err == nil {
		f.Since = &t
	}
	if t, err := time.Parse(time.RFC3339, q.Get("until")); err == nil {
		f.Until = &t
	}
	tx, err := h.svc.ProjectTransactions(r.Context(), u.ID, chi.URLParam(r, "projID"), f)
	if err != nil {
		mapErr(w, err)
		return
	}
	limit := f.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	next := ""
	if len(tx) == limit {
		next = tx[len(tx)-1].CreatedAt.Format(time.RFC3339Nano)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"transactions": tx, "next_cursor": next})
}

// GET /wallet-account-purposes
//
// What a developer may choose, from the one place that decides it. Session-scoped
// only because everything on this router is; the answer is the same for everyone.
func (h *Handlers) walletAccountPurposes(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]any{"purposes": PublicWalletAccountPurposes})
}

// POST /projects/{projID}/wallet-accounts
//
// Opens a segregated destination under the project's own financial owner — the
// same primitive DOA uses for a campaign, and the same one the published SDK
// exposes. The body carries a label, a purpose and a reference of the caller's
// choosing, and nothing that decides whose money it is.
func (h *Handlers) createWalletAccount(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	// The published SDK's field names, so one resource has one contract.
	var in struct {
		Label         string `json:"label"`
		Purpose       string `json:"purpose"`
		ReferenceType string `json:"reference_type"`
		ReferenceID   string `json:"reference_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "VALIDATION", "invalid body")
		return
	}
	ip, reqID := reqMeta(r)
	acct, err := h.svc.CreateProjectWalletAccount(r.Context(), u.ID, chi.URLParam(r, "projID"),
		WalletAccountRequest{
			Label: in.Label, Purpose: in.Purpose,
			ReferenceType: in.ReferenceType, ReferenceID: in.ReferenceID,
		}, ip, reqID)
	if err != nil {
		switch {
		case errors.Is(err, ErrUnsupportedPurpose):
			httpx.Error(w, http.StatusBadRequest, "UNSUPPORTED_PURPOSE",
				"that account purpose is not available to developer projects")
			return
		case errors.Is(err, ErrSetupUnavailable):
			httpx.Error(w, http.StatusServiceUnavailable, "SETUP_UNAVAILABLE",
				"wallet accounts are not available on this deployment")
			return
		}
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, acct)
}

// GET /projects/{projID}/financial-setup
//
// The project's financial lifecycle, in the developer's own terms: is this
// project able to take a payment yet, may I be the one to make it so, and has
// the destination locked. Nothing about merchants, wallets or bindings — those
// are how it works, not what they need to know.
func (h *Handlers) financialSetup(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	st, err := h.svc.ProjectFinancialSetup(r.Context(), u.ID, chi.URLParam(r, "projID"))
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, st)
}

// POST /projects/{projID}/financial-setup
//
// Behind the CSRF guard with the other state-changing routes. It takes no body:
// there is no merchant, wallet or owner to supply, because supplying one is
// exactly what this exists to make unnecessary.
func (h *Handlers) configureFinancialSetup(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	ip, reqID := reqMeta(r)
	st, err := h.svc.ConfigureProjectFinancialSandbox(r.Context(), u.ID,
		chi.URLParam(r, "projID"), ip, reqID)
	if err != nil {
		switch {
		case errors.Is(err, ErrWrongEnvironment):
			httpx.Error(w, http.StatusForbidden, "SANDBOX_ONLY",
				"financial setup is available in the Sandbox only")
			return
		case errors.Is(err, ErrSetupUnavailable):
			httpx.Error(w, http.StatusServiceUnavailable, "SETUP_UNAVAILABLE",
				"sandbox financial setup is not available on this deployment")
			return
		case errors.Is(err, ErrOneClickSetupRetired):
			httpx.Error(w, http.StatusGone, "FINANCIAL_SETUP_BY_REVIEW", err.Error())
			return
		}
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, st)
}

// onboardingErr answers a financial onboarding refusal. A reasoned refusal
// from the Business application domain (a handle taken, a code that is not
// valid, an application already in progress) reaches the developer with its
// own code; everything else is mapped as usual.
func onboardingErr(w http.ResponseWriter, err error) {
	var refusal *gatewayclient.Refusal
	switch {
	case errors.As(err, &refusal):
		httpx.Error(w, refusal.Status, refusal.Code, refusal.Message)
	case errors.Is(err, ErrProjectAlreadyReceiving):
		httpx.Error(w, http.StatusConflict, "PROJECT_ALREADY_RECEIVING", err.Error())
	case errors.Is(err, ErrOnboardingUnavailable), errors.Is(err, gatewayclient.ErrUnavailable):
		httpx.Error(w, http.StatusServiceUnavailable, "ONBOARDING_UNAVAILABLE", "financial onboarding is unavailable; try again")
	case errors.Is(err, ErrConflict):
		httpx.Error(w, http.StatusConflict, "PROJECT_ALREADY_RECEIVING", "this Project already receives into another Business")
	default:
		mapErr(w, err)
	}
}

// POST /projects/{projID}/financial-onboarding/applications
// A Project applies for a NEW Business: the Business's details, in the same
// shape the public form sends. The Project and the member come from the
// session, never from the body.
func (h *Handlers) submitFinancialApplication(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	var in gatewayclient.ApplicationInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "VALIDATION", "invalid request")
		return
	}
	ip, reqID := reqMeta(r)
	id, err := h.svc.SubmitFinancialApplication(r.Context(), u.ID, chi.URLParam(r, "projID"), in, ip, reqID)
	if err != nil {
		onboardingErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"application_id": id, "status": "SUBMITTED"})
}

// POST /projects/{projID}/financial-onboarding/link   {code}
// A Project connects a Business that already exists, with the consent code the
// Business issued from its own app.
func (h *Handlers) linkExistingBusiness(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	var in struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&in); err != nil || in.Code == "" {
		httpx.Error(w, http.StatusBadRequest, "VALIDATION", "the Business's code is required")
		return
	}
	ip, reqID := reqMeta(r)
	b, err := h.svc.LinkExistingBusiness(r.Context(), u.ID, chi.URLParam(r, "projID"), in.Code, ip, reqID)
	if err != nil {
		onboardingErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"business": b})
}

// GET /projects/{projID}/refund-capability
//
// What the Console may show. The answer separates "your role may not" from
// "this deployment has no refund path", because they lead somewhere different:
// one is a permission to ask a colleague for, and the other is nobody's to grant.
func (h *Handlers) refundCapability(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	cap, err := h.svc.ProjectRefundCapability(r.Context(), u.ID, chi.URLParam(r, "projID"))
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, cap)
}

// POST /projects/{projID}/payments/{payID}/refund
//
// Behind the CSRF guard with the other state-changing routes, because it is the
// most state-changing one there is: it moves money out of an account.
//
// The body carries an amount, a reason and an idempotency key. It does not carry
// a merchant, a wallet or a source — those are derived from the project's binding
// and from the payment itself, so there is no field here an attacker could aim.
func (h *Handlers) refundPayment(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	var in struct {
		AmountMinor    int64  `json:"amount_minor"`
		Reason         string `json:"reason"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "VALIDATION", "invalid body")
		return
	}
	res, err := h.svc.ProjectRefund(r.Context(), u.ID, chi.URLParam(r, "projID"), RefundRequest{
		PaymentID:      chi.URLParam(r, "payID"),
		AmountMinor:    in.AmountMinor,
		Reason:         in.Reason,
		IdempotencyKey: in.IdempotencyKey,
	})
	if err != nil {
		// Core's own refusals reach the caller intact. A ceiling that has been
		// reached, a balance that cannot cover it and a reused idempotency key
		// are three different things to do next, and collapsing them into one
		// message leaves someone pressing a button that can never work.
		var rej *RefundRejection
		if errors.As(err, &rej) {
			httpx.Error(w, http.StatusConflict, rej.Code, rej.Message)
			return
		}
		switch {
		case errors.Is(err, ErrNoRefundSource):
			httpx.Error(w, http.StatusConflict, "NOT_REFUNDABLE",
				"this payment has not been paid, so there is nothing to return")
			return
		case errors.Is(err, ErrNotConfigured):
			httpx.Error(w, http.StatusServiceUnavailable, "REFUNDS_NOT_CONFIGURED",
				"refunds are not configured on this deployment")
			return
		}
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// POST /projects/{projID}/webhooks/endpoints   {url, events[]}
//
// Returns the signing secret exactly once, in this response. Nothing else ever
// returns it: the view type has no field for it, and the row holds it encrypted.
func (h *Handlers) createWebhookEndpoint(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	var body struct {
		URL    string   `json:"url"`
		Events []string `json:"events"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	ep, err := h.svc.CreateProjectWebhookEndpoint(r.Context(), u.ID, chi.URLParam(r, "projID"), body.URL, body.Events)
	if err != nil {
		mapWebhookErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, ep)
}

// POST /projects/{projID}/webhooks/endpoints/{epID}/rotate-secret
func (h *Handlers) rotateWebhookSecret(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	ep, err := h.svc.RotateProjectWebhookSecret(r.Context(), u.ID, chi.URLParam(r, "projID"), chi.URLParam(r, "epID"))
	if err != nil {
		mapWebhookErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, ep)
}

// PATCH /projects/{projID}/webhooks/endpoints/{epID}   {active}
func (h *Handlers) setWebhookEndpointActive(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	var body struct {
		Active *bool `json:"active"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil || body.Active == nil {
		httpx.Error(w, http.StatusBadRequest, "INVALID_BODY", "active is required")
		return
	}
	ep, err := h.svc.SetProjectWebhookEndpointActive(r.Context(), u.ID, chi.URLParam(r, "projID"), chi.URLParam(r, "epID"), *body.Active)
	if err != nil {
		mapWebhookErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, ep)
}

func (h *Handlers) replayWebhookDelivery(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	err := h.svc.ReplayProjectWebhookDelivery(r.Context(), u.ID,
		chi.URLParam(r, "projID"), chi.URLParam(r, "deliveryID"))
	if err == ErrConflict {
		httpx.Error(w, http.StatusConflict, "DELIVERY_ALREADY_SUCCEEDED",
			"this delivery already succeeded — replay is for one that failed")
		return
	}
	if err != nil {
		mapWebhookErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"status": "PENDING"})
}

func (h *Handlers) deleteWebhookEndpoint(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	err := h.svc.DeleteProjectWebhookEndpoint(r.Context(), u.ID,
		chi.URLParam(r, "projID"), chi.URLParam(r, "epID"))
	if err == ErrConflict {
		httpx.Error(w, http.StatusConflict, "ENDPOINT_HAS_DELIVERIES",
			"this endpoint has delivery history — disable it instead of deleting it")
		return
	}
	if err != nil {
		mapWebhookErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// mapWebhookErr keeps the two rejections a developer can act on distinguishable
// from the generic ones. "Your URL is not allowed" and "that event does not
// exist" are fixable at the keyboard; collapsing them into 400 INVALID_BODY
// would send someone hunting through their JSON.
func mapWebhookErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrWebhookURLRejected):
		httpx.Error(w, http.StatusBadRequest, "WEBHOOK_URL_REJECTED",
			"the endpoint must be a public https URL")
	case errors.Is(err, ErrUnsupportedEvent):
		httpx.Error(w, http.StatusBadRequest, "UNSUPPORTED_EVENT",
			"one of the event types is not emitted by this platform")
	default:
		mapErr(w, err)
	}
}

func (h *Handlers) listWebhookEndpoints(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	eps, err := h.svc.ProjectWebhookEndpoints(r.Context(), u.ID, chi.URLParam(r, "projID"))
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"endpoints": eps})
}

func (h *Handlers) listWebhookEvents(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	evs, err := h.svc.ProjectWebhookEvents(r.Context(), u.ID, chi.URLParam(r, "projID"), limit)
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"events": evs})
}

func (h *Handlers) listWebhookDeliveries(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	ds, err := h.svc.ProjectWebhookDeliveries(r.Context(), u.ID,
		chi.URLParam(r, "projID"), chi.URLParam(r, "eventID"))
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"deliveries": ds})
}

// listAPIRequestLogs serves the Console's Logs screen: this project's own
// Developer API requests. Filters narrow; none of them can name another project.
func (h *Handlers) listAPIRequestLogs(w http.ResponseWriter, r *http.Request) {
	u, ok := actor(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "sign in")
		return
	}
	q := r.URL.Query()
	f := RequestLogFilter{RequestID: q.Get("request_id"), Path: q.Get("path")}
	f.Limit, _ = strconv.Atoi(q.Get("limit"))
	f.Status, _ = strconv.Atoi(q.Get("status"))
	if v := q.Get("since"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			f.Since = &t
		}
	}
	if v := q.Get("until"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			f.Until = &t
		}
	}
	logs, err := h.svc.ProjectAPIRequestLogs(r.Context(), u.ID, chi.URLParam(r, "projID"), f)
	if err != nil {
		mapErr(w, err)
		return
	}
	// The summary is aggregated in SQL over the same window, so the Overview's
	// numbers describe the project's traffic rather than the size of this page.
	summary, err := h.svc.ProjectAPIRequestSummary(r.Context(), u.ID, chi.URLParam(r, "projID"), f)
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"logs":    logs,
		"summary": summary,
		// The Console tells the developer how long a line survives, so an absent
		// old request reads as retention rather than as a lost record.
		"retention_days": RequestLogRetentionDays,
	})
}

// actor pulls the authenticated Account Identity user out of the request context.
func actor(r *http.Request) (accountidentity.User, bool) {
	return accountidentity.UserFrom(r.Context())
}

func reqMeta(r *http.Request) (ip, reqID string) { return realIP(r), obs.RequestID(r.Context()) }

func body(r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 8192))
	dec.DisallowUnknownFields()
	return dec.Decode(v) == nil
}

// mapErr translates domain errors to HTTP status + stable code.
func mapErr(w http.ResponseWriter, err error) {
	// A project of yours that has not been set up is not a missing project. It is
	// a state with a name, an action, and a place in the Console to perform it —
	// so it gets a code that says which, rather than the not-found that a
	// stranger's project gets.
	if errors.Is(err, ErrFinancialSetupRequired) {
		httpx.Error(w, http.StatusConflict, "PROJECT_FINANCIAL_SETUP_REQUIRED",
			"this project has no Sandbox financial setup yet — configure it in the Developers Console")
		return
	}
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

func (h *Handlers) renameWorkspace(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	var in struct {
		Name string `json:"name"`
	}
	if !body(r, &in) {
		mapErr(w, ErrValidation)
		return
	}
	ip, rid := reqMeta(r)
	ws, err := h.svc.RenameWorkspace(r.Context(), u.ID, chi.URLParam(r, "wsID"), in.Name, ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, workspaceView(ws))
}

// DELETE /workspaces/{wsID} — delete a workspace that never held a project.
//
// The same shape as DELETE /projects/{projID} one level down, and for the same
// reason: a workspace with a history is archived, a workspace without one can be
// taken back. A workspace that still holds projects — active OR archived — is
// refused with the counts, so the Console can say which.
//
// The body must repeat the workspace's own name.
func (h *Handlers) deleteWorkspace(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	var in struct {
		Name string `json:"name"`
	}
	if !body(r, &in) {
		mapErr(w, ErrValidation)
		return
	}
	ip, rid := reqMeta(r)
	f, err := h.svc.DeleteWorkspace(r.Context(), u.ID, chi.URLParam(r, "wsID"), in.Name, ip, rid)
	if err == ErrConflict {
		httpx.ErrorWithDetails(w, http.StatusConflict, "WORKSPACE_NOT_EMPTY",
			"this workspace has projects and can be archived, not deleted",
			map[string]any{
				"projects": f.Projects, "active_projects": f.ActiveProjects,
				"archived_projects": f.ArchivedProjects, "blockers": f.Blockers(),
			})
		return
	}
	if err != nil {
		mapErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /workspaces/{wsID}/archive — archive.
//
// The body must repeat the workspace's own name. A destructive action reached by
// a single verb on a single id is one stray request away from happening by
// accident; requiring the caller to reproduce something they had to look up
// first makes that impossible.
func (h *Handlers) archiveWorkspace(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	var in struct {
		Name string `json:"name"`
	}
	if !body(r, &in) {
		mapErr(w, ErrValidation)
		return
	}
	ip, rid := reqMeta(r)
	blockers, err := h.svc.ArchiveWorkspace(r.Context(), u.ID, chi.URLParam(r, "wsID"), in.Name, ip, rid)
	if err == ErrConflict {
		// Named, not generic: the Console must be able to say "2 projectos
		// activos" without guessing why the call failed.
		httpx.ErrorWithDetails(w, http.StatusConflict, "WORKSPACE_NOT_EMPTY",
			"archive or delete this workspace's active projects first",
			map[string]any{"active_projects": blockers.ActiveProjects})
		return
	}
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"status": "ARCHIVED"})
}

func (h *Handlers) leaveWorkspace(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	ip, rid := reqMeta(r)
	if err := h.svc.LeaveWorkspace(r.Context(), u.ID, chi.URLParam(r, "wsID"), ip, rid); err != nil {
		mapErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
		// Name and email so a team can see who its members are. The Console
		// rendered a truncated UUID per row, which told nobody who they were
		// about to demote. Both are the member's own sign-in identity, visible
		// to people who already share a workspace with them.
		out = append(out, map[string]any{
			"user_id": m.UserID, "role": m.Role, "status": m.Status,
			"name": m.Name, "email": m.Email,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"members": out})
}

func (h *Handlers) listInvites(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	invs, err := h.svc.ListPendingInvites(r.Context(), u.ID, chi.URLParam(r, "wsID"))
	if err != nil {
		mapErr(w, err)
		return
	}
	out := make([]map[string]any, 0, len(invs))
	for _, i := range invs {
		// No token, no token hash. An invite token is a bearer capability: a list
		// that carried one would let any manager accept on somebody else's behalf.
		out = append(out, map[string]any{
			"id": i.ID, "email": i.Email, "role": i.Role,
			"expires_at": i.ExpiresAt, "created_at": i.CreatedAt,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"invites": out})
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
	// Archived projects are excluded unless asked for. The Console's selector
	// asks for the default; its "Mostrar arquivados" affordance asks for both.
	includeArchived := r.URL.Query().Get("include_archived") == "true"
	ps, err := h.svc.ListProjects(r.Context(), u.ID, chi.URLParam(r, "wsID"), includeArchived)
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

func (h *Handlers) renameProject(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	var in struct {
		Name string `json:"name"`
	}
	if !body(r, &in) {
		mapErr(w, ErrValidation)
		return
	}
	ip, rid := reqMeta(r)
	p, err := h.svc.RenameProject(r.Context(), u.ID, chi.URLParam(r, "projID"), in.Name, ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, projectView(p))
}

// GET /projects/{projID}/footprint — what the project holds, and therefore
// whether it can be deleted or only archived. The Console asks this before it
// offers either, so the dialog states the consequence instead of discovering it.
func (h *Handlers) projectFootprint(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	f, err := h.svc.ProjectFootprintFor(r.Context(), u.ID, chi.URLParam(r, "projID"))
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"keys": f.Keys, "request_logs": f.RequestLogs, "bindings": f.Bindings,
		"deletable": f.Empty(), "blockers": f.Blockers(),
	})
}

// GET /workspaces/{wsID}/footprint — what the workspace holds, and therefore
// whether it can be deleted or only archived. The Console asks this before it
// offers either, so the danger zone names the real operation.
func (h *Handlers) workspaceFootprint(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	f, err := h.svc.WorkspaceFootprintFor(r.Context(), u.ID, chi.URLParam(r, "wsID"))
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"projects": f.Projects, "active_projects": f.ActiveProjects,
		"archived_projects": f.ArchivedProjects,
		"deletable":         f.Empty(), "blockers": f.Blockers(),
	})
}

// DELETE /projects/{projID} — delete an empty project, refuse anything else.
func (h *Handlers) deleteProject(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	var in struct {
		Name string `json:"name"`
	}
	if !body(r, &in) {
		mapErr(w, ErrValidation)
		return
	}
	ip, rid := reqMeta(r)
	f, err := h.svc.DeleteProject(r.Context(), u.ID, chi.URLParam(r, "projID"), in.Name, ip, rid)
	if err == ErrConflict {
		httpx.ErrorWithDetails(w, http.StatusConflict, "PROJECT_NOT_EMPTY",
			"this project has history and can be archived, not deleted",
			map[string]any{
				"keys": f.Keys, "request_logs": f.RequestLogs, "bindings": f.Bindings,
				"blockers": f.Blockers(),
			})
		return
	}
	if err != nil {
		mapErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /projects/{projID}/archive — the developer-facing counterpart of the
// internal retire route. Revokes every active key and disables an unsealed
// binding, so an archived project holds no authority.
func (h *Handlers) archiveProjectByOwner(w http.ResponseWriter, r *http.Request) {
	u, _ := actor(r)
	var in struct {
		Name string `json:"name"`
	}
	if !body(r, &in) {
		mapErr(w, ErrValidation)
		return
	}
	ip, rid := reqMeta(r)
	revoked, err := h.svc.ArchiveProject(r.Context(), u.ID, chi.URLParam(r, "projID"), in.Name, ip, rid)
	if err != nil {
		mapErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"status": "ARCHIVED", "keys_revoked": revoked})
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

// realIP is the client clientip resolved for this service (RemoteAddr), never
// the caller's own X-Forwarded-For (A9-09).
func realIP(r *http.Request) string { return clientip.Host(r.RemoteAddr) }
