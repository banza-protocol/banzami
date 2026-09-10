package developer

import (
	"github.com/banzami/banzami/services/common/webhookprov"

	"context"
	"errors"
	"log/slog"
	"strings"
	"time"
)

// Service enforces the Developer-domain authorization matrix over a Store. Every
// call takes the authenticated actor's user id (from Account Identity); no
// client-supplied workspace/user id is trusted without a membership check.
type Service struct {
	store           Store
	inviteSecret    string
	apiKeyPepper    string
	inviteTTL       time.Duration
	payee           PayeeValidator
	refunder        Refunder                 // Core refund boundary; nil until wired (see refunds.go)
	provisioner     SandboxProvisioner       // Sandbox financial owner provisioning; nil until wired
	sandboxEnv      bool                     // self-service financial setup is sandbox-only
	walletProv      WalletAccountProvisioner // segregated destination creation; nil until wired
	paymentReleased bool                     // deploy-vs-release control (RT04C §1)
	fixturesEnabled bool                     // operator E2E fixture-key path, sandbox-only (RT04D §2)
	// webhookCipher encrypts webhook signing secrets at rest. Nil stores them in
	// the clear, which only sandbox permits.
	webhookCipher *webhookprov.SecretCipher
}

// PayeeValidator validates a merchant→wallet→wallet_account payee against the
// independently-authoritative Core before a binding is recorded (ADR-047 §3).
// Returns (valid, reason); a non-nil error means Core was unavailable → the
// caller MUST fail closed.
type PayeeValidator interface {
	ValidatePayee(ctx context.Context, merchantID, walletID, walletAccountID string) (bool, string, error)
}

func NewService(store Store, inviteSecret, apiKeyPepper string, inviteTTL time.Duration) *Service {
	if inviteTTL == 0 {
		inviteTTL = 7 * 24 * time.Hour
	}
	return &Service{store: store, inviteSecret: inviteSecret, apiKeyPepper: apiKeyPepper, inviteTTL: inviteTTL}
}

// SetPayeeValidator wires the Core payee-validation boundary. Until set,
// BindProjectSandbox fails closed (no binding may be recorded on an unverified
// payee).
func (s *Service) SetPayeeValidator(v PayeeValidator) { s.payee = v }

// SetPaymentCapabilityReleased sets the deploy-vs-release control (RT04C §1).
// When false (the fail-closed default), payment scopes cannot be issued to
// ordinary external keys through the public Console path — the code may be
// deployed and exercised by operator E2E fixtures without being publicly
// available. Config already forces this false outside a sandbox environment.
func (s *Service) SetPaymentCapabilityReleased(released bool) { s.paymentReleased = released }

// PaymentCapabilityReleased reports the current public-release state (for the
// Console scope-catalog + status surfaces).
func (s *Service) PaymentCapabilityReleased() bool { return s.paymentReleased }

// SetFixturesEnabled hard-gates the operator E2E fixture-key path (RT04D §2).
// Main sets this true ONLY in a sandbox/development environment, so the fixture
// path is hard-disabled outside Sandbox regardless of any other configuration.
func (s *Service) SetFixturesEnabled(enabled bool) { s.fixturesEnabled = enabled }

// canBuild reports whether a role may create projects / issue API keys.
func canBuild(role string) bool {
	return role == RoleOwner || role == RoleAdmin || role == RoleDeveloper
}

// ── authorization helpers ────────────────────────────────────────────────────

func (s *Service) roleOf(ctx context.Context, wsID, userID string) (string, error) {
	mem, err := s.store.Membership(ctx, wsID, userID)
	if err != nil || mem == nil {
		return "", ErrForbidden // non-members cannot even see the workspace exists
	}
	return mem.Role, nil
}

func isManager(role string) bool { return role == RoleOwner || role == RoleAdmin }

// canAssign reports whether an actor with actorRole may grant targetRole.
// OWNER may grant anything; ADMIN may grant only non-privileged roles.
func canAssign(actorRole, targetRole string) bool {
	if actorRole == RoleOwner {
		return true
	}
	if actorRole == RoleAdmin {
		return targetRole == RoleDeveloper || targetRole == RoleFinance || targetRole == RoleViewer
	}
	return false
}

// canModifyTarget reports whether actorRole may change/remove a member currently
// holding targetRole. ADMIN may not touch OWNER/ADMIN members.
func canModifyTarget(actorRole, targetRole string) bool {
	if actorRole == RoleOwner {
		return true
	}
	if actorRole == RoleAdmin {
		return targetRole != RoleOwner && targetRole != RoleAdmin
	}
	return false
}

// ── workspaces ───────────────────────────────────────────────────────────────

func (s *Service) CreateWorkspace(ctx context.Context, actor, name, ip, reqID string) (Workspace, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 80 {
		return Workspace{}, ErrValidation
	}
	base := slugify(name)
	if base == "" {
		base = "workspace"
	}
	slug := base
	for i := 0; i < 5; i++ {
		ws, err := s.store.CreateWorkspace(ctx, name, slug, actor)
		if err == nil {
			s.audit(ctx, &actor, &ws.ID, nil, "workspace.created", "WORKSPACE:"+ws.ID, ip, reqID, nil)
			return ws, nil
		}
		if err != ErrConflict {
			return Workspace{}, ErrUnavailable
		}
		suffix, _, terr := newToken(s.inviteSecret)
		if terr != nil {
			return Workspace{}, ErrUnavailable
		}
		slug = base + "-" + suffix[:6]
	}
	return Workspace{}, ErrConflict
}

func (s *Service) ListWorkspaces(ctx context.Context, actor string) ([]Workspace, error) {
	return s.store.WorkspacesForUser(ctx, actor)
}

func (s *Service) GetWorkspace(ctx context.Context, actor, wsID string) (Workspace, error) {
	if _, err := s.roleOf(ctx, wsID, actor); err != nil {
		return Workspace{}, ErrForbidden
	}
	ws, err := s.store.Workspace(ctx, wsID)
	if err != nil {
		return Workspace{}, ErrNotFound
	}
	return ws, nil
}

func (s *Service) ListMembers(ctx context.Context, actor, wsID string) ([]Member, error) {
	if _, err := s.roleOf(ctx, wsID, actor); err != nil {
		return nil, ErrForbidden
	}
	return s.store.Members(ctx, wsID)
}

// ── membership + invites ─────────────────────────────────────────────────────

// InviteMember creates an invite and returns the raw invite token (shown once).
func (s *Service) InviteMember(ctx context.Context, actor, wsID, email, role, ip, reqID string) (Invite, string, error) {
	actorRole, err := s.roleOf(ctx, wsID, actor)
	if err != nil {
		return Invite{}, "", ErrForbidden
	}
	if !isManager(actorRole) {
		return Invite{}, "", ErrForbidden
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || !strings.Contains(email, "@") || !ValidRole(role) {
		return Invite{}, "", ErrValidation
	}
	if !canAssign(actorRole, role) {
		return Invite{}, "", ErrForbidden // no privilege escalation
	}
	if inv, _ := s.store.ActiveInviteByEmail(ctx, wsID, email); inv != nil {
		return Invite{}, "", ErrConflict // one active invite per workspace+email
	}
	raw, hash, err := newToken(s.inviteSecret)
	if err != nil {
		return Invite{}, "", ErrUnavailable
	}
	inv, err := s.store.CreateInvite(ctx, InviteInsert{
		WorkspaceID: wsID, Email: email, Role: role, TokenHash: hash,
		InvitedBy: actor, ExpiresAt: time.Now().Add(s.inviteTTL),
	})
	if err != nil {
		return Invite{}, "", ErrUnavailable
	}
	s.audit(ctx, &actor, &wsID, nil, "member.invited", "EMAIL:"+email, ip, reqID, map[string]any{"role": role})
	return inv, raw, nil
}

// AcceptInvite accepts an invite for the authenticated user whose email matches.
func (s *Service) AcceptInvite(ctx context.Context, actor, actorEmail, rawToken, ip, reqID string) (Member, error) {
	inv, err := s.store.InviteByTokenHash(ctx, hashToken(rawToken, s.inviteSecret))
	if err != nil || inv == nil {
		return Member{}, ErrInviteState
	}
	if inv.AcceptedAt != nil || inv.RevokedAt != nil || time.Now().After(inv.ExpiresAt) {
		return Member{}, ErrInviteState
	}
	if inv.Email != strings.ToLower(strings.TrimSpace(actorEmail)) {
		return Member{}, ErrForbidden // invite is bound to a specific email
	}
	mem, err := s.store.AcceptInvite(ctx, inv.ID, actor)
	if err != nil {
		return Member{}, ErrUnavailable
	}
	s.audit(ctx, &actor, &inv.WorkspaceID, nil, "member.joined", "USER:"+actor, ip, reqID, map[string]any{"role": inv.Role})
	return mem, nil
}

func (s *Service) RevokeInvite(ctx context.Context, actor, wsID, inviteID, ip, reqID string) error {
	actorRole, err := s.roleOf(ctx, wsID, actor)
	if err != nil || !isManager(actorRole) {
		return ErrForbidden
	}
	if err := s.store.RevokeInvite(ctx, inviteID); err != nil {
		return ErrNotFound
	}
	s.audit(ctx, &actor, &wsID, nil, "invite.revoked", "INVITE:"+inviteID, ip, reqID, nil)
	return nil
}

// SetMemberRole changes a member's role, enforcing escalation + last-owner rules.
func (s *Service) SetMemberRole(ctx context.Context, actor, wsID, targetUser, newRole, ip, reqID string) error {
	if !ValidRole(newRole) {
		return ErrValidation
	}
	actorRole, err := s.roleOf(ctx, wsID, actor)
	if err != nil || !isManager(actorRole) {
		return ErrForbidden
	}
	target, err := s.store.Membership(ctx, wsID, targetUser)
	if err != nil || target == nil {
		return ErrNotFound
	}
	if !canModifyTarget(actorRole, target.Role) || !canAssign(actorRole, newRole) {
		return ErrForbidden
	}
	if target.Role == RoleOwner && newRole != RoleOwner {
		if n, _ := s.store.CountOwners(ctx, wsID); n <= 1 {
			return ErrLastOwner
		}
	}
	if err := s.store.SetMemberRole(ctx, wsID, targetUser, newRole); err != nil {
		return ErrUnavailable
	}
	s.audit(ctx, &actor, &wsID, nil, "member.role_changed", "USER:"+targetUser, ip, reqID, map[string]any{"role": newRole})
	return nil
}

// RemoveMember removes a member, enforcing escalation + last-owner rules.
func (s *Service) RemoveMember(ctx context.Context, actor, wsID, targetUser, ip, reqID string) error {
	actorRole, err := s.roleOf(ctx, wsID, actor)
	if err != nil || !isManager(actorRole) {
		return ErrForbidden
	}
	target, err := s.store.Membership(ctx, wsID, targetUser)
	if err != nil || target == nil {
		return ErrNotFound
	}
	if !canModifyTarget(actorRole, target.Role) {
		return ErrForbidden
	}
	if target.Role == RoleOwner {
		if n, _ := s.store.CountOwners(ctx, wsID); n <= 1 {
			return ErrLastOwner
		}
	}
	if err := s.store.RemoveMember(ctx, wsID, targetUser); err != nil {
		return ErrUnavailable
	}
	s.audit(ctx, &actor, &wsID, nil, "member.removed", "USER:"+targetUser, ip, reqID, nil)
	return nil
}

// ── projects ─────────────────────────────────────────────────────────────────

func (s *Service) CreateProject(ctx context.Context, actor, wsID, name, ip, reqID string) (Project, error) {
	role, err := s.roleOf(ctx, wsID, actor)
	if err != nil || !canBuild(role) {
		return Project{}, ErrForbidden
	}
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 80 {
		return Project{}, ErrValidation
	}
	base := slugify(name)
	if base == "" {
		base = "project"
	}
	slug := base
	for i := 0; i < 5; i++ {
		p, err := s.store.CreateProject(ctx, wsID, name, slug)
		if err == nil {
			s.audit(ctx, &actor, &wsID, &p.ID, "project.created", "PROJECT:"+p.ID, ip, reqID, nil)
			return p, nil
		}
		if err != ErrConflict {
			return Project{}, ErrUnavailable
		}
		suffix, _, terr := newToken(s.inviteSecret)
		if terr != nil {
			return Project{}, ErrUnavailable
		}
		slug = base + "-" + suffix[:6]
	}
	return Project{}, ErrConflict
}

func (s *Service) ListProjects(ctx context.Context, actor, wsID string) ([]Project, error) {
	if _, err := s.roleOf(ctx, wsID, actor); err != nil {
		return nil, ErrForbidden
	}
	return s.store.ProjectsForWorkspace(ctx, wsID)
}

// projectAuthz resolves a project and the actor's role in its workspace.
func (s *Service) projectAuthz(ctx context.Context, actor, projectID string) (*Project, string, error) {
	p, err := s.store.Project(ctx, projectID)
	if err != nil || p == nil {
		return nil, "", ErrNotFound
	}
	role, err := s.roleOf(ctx, p.WorkspaceID, actor)
	if err != nil {
		// Not found, not forbidden. 403 for a project that exists and 404 for one
		// that does not tells a caller which project ids are real — an oracle
		// that costs nothing to query and answers a question no outsider should
		// be able to ask. A project you are not a member of is, as far as you are
		// concerned, a project that does not exist.
		return nil, "", ErrNotFound
	}
	return p, role, nil
}

// ── Webhook visibility ───────────────────────────────────────────────────────
//
// The Console's webhooks screen used to render invented endpoints and deliveries
// behind an "illustrative data" label. These serve the project's real ones.
//
// Authority is the project binding and nothing else: the caller is authorised
// against the project, the project's ACTIVE binding names the merchant, and the
// merchant scopes every query. No request field carries a merchant, so there is
// none to reject.
//
// An unbound project has no webhooks — not an empty list, which would assert the
// question was meaningful and the answer was "none".

// ErrFinancialSetupRequired: the caller is authorised for this project and the
// project has no financial owner yet.
//
// This used to be ErrNotFound, and that was wrong in a way that cost an external
// developer their first hour. A fresh project answered 404 on balances,
// transactions and webhooks — the same answer as a project that does not exist,
// or one belonging to someone else — so the only signal that anything was
// missing was three routes that looked broken. Not-found is the right answer for
// a project you may not see; it is the wrong answer for your own project in a
// state the product has a name for.
//
// The privacy-safe 404 is untouched: a non-member and a nonexistent project
// still both get not-found, because telling them apart is the oracle that answer
// exists to prevent.
var ErrFinancialSetupRequired = errors.New("project financial setup required")

// projectMerchant authorises the actor for the project and returns the merchant
// its binding names.
func (s *Service) projectMerchant(ctx context.Context, actor, projectID string) (string, error) {
	p, _, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return "", err
	}
	b, err := s.store.ActiveBindingForProject(ctx, p.ID)
	if err != nil {
		return "", ErrUnavailable
	}
	if b == nil || b.MerchantID == "" {
		return "", ErrFinancialSetupRequired
	}
	return b.MerchantID, nil
}

// ProjectBalances answers "what does this project's financial owner hold?".
//
// The authority chain is the same as every other project-scoped read here:
// session → workspace membership → project → its ACTIVE binding → the merchant
// that binding names. The caller supplies a project id and nothing else; the
// merchant is derived, never accepted. A project with no binding has no
// balances to show and says so, rather than falling back to anything.
func (s *Service) ProjectBalances(ctx context.Context, actor, projectID string, f WalletAccountFilter) ([]WalletAccountView, int, error) {
	m, err := s.projectMerchant(ctx, actor, projectID)
	if err != nil {
		return nil, 0, err
	}
	accounts, err := s.store.WalletAccountsForMerchant(ctx, m, f)
	if err != nil {
		return nil, 0, ErrUnavailable
	}
	total, err := s.store.WalletAccountCountForMerchant(ctx, m)
	if err != nil {
		return nil, 0, ErrUnavailable
	}
	return accounts, total, nil
}

// ProjectTransactions answers "what money moved under this project?" — the
// question the API log deliberately does not answer.
func (s *Service) ProjectTransactions(ctx context.Context, actor, projectID string, f TransactionFilter) ([]TransactionView, error) {
	m, err := s.projectMerchant(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}
	tx, err := s.store.TransactionsForMerchant(ctx, m, f)
	if err != nil {
		// Logged because the alternative is what happened while building this:
		// a 503 with no server-side trace, diagnosed by bisecting the page size
		// from outside. The message is the driver's, not the caller's — it never
		// reaches the response.
		slog.ErrorContext(ctx, "developer.transactions.query_failed", "err", err.Error())
		return nil, ErrUnavailable
	}
	return tx, nil
}

func (s *Service) ProjectWebhookEndpoints(ctx context.Context, actor, projectID string) ([]WebhookEndpointView, error) {
	m, err := s.projectMerchant(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}
	return s.store.WebhookEndpointsForMerchant(ctx, m)
}

func (s *Service) ProjectWebhookEvents(ctx context.Context, actor, projectID string, limit int) ([]WebhookEventView, error) {
	m, err := s.projectMerchant(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}
	return s.store.WebhookEventsForMerchant(ctx, m, limit)
}

func (s *Service) ProjectWebhookDeliveries(ctx context.Context, actor, projectID, eventID string) ([]WebhookDeliveryView, error) {
	m, err := s.projectMerchant(ctx, actor, projectID)
	if err != nil {
		return nil, err
	}
	return s.store.WebhookDeliveriesForEvent(ctx, m, eventID)
}

// ── API request logs ─────────────────────────────────────────────────────────

// ProjectAPIRequestLogs returns the project's own Developer API request log.
//
// Authority is workspace membership and nothing else: projectAuthz rejects a
// caller who is not a member, and the store applies the project id inside the
// query, so a foreign project's rows are unreachable by two independent
// mechanisms rather than one. A request_id belonging to another project is
// simply not found here — it never becomes an existence oracle, because the
// answer for "someone else's id" and "an id that never existed" is the same
// empty list.
func (s *Service) ProjectAPIRequestLogs(ctx context.Context, actor, projectID string, f RequestLogFilter) ([]APIRequestLogView, error) {
	if _, _, err := s.projectAuthz(ctx, actor, projectID); err != nil {
		return nil, err
	}
	return s.store.APIRequestLogs(ctx, projectID, f)
}

// ProjectAPIRequestSummary aggregates the same rows the list returns, under the
// same authority. Aggregating client-side would be wrong twice: the list is
// capped, so a "total" would really be a page size, and the Overview would be
// quietly reporting one number while meaning another.
func (s *Service) ProjectAPIRequestSummary(ctx context.Context, actor, projectID string, f RequestLogFilter) (RequestLogSummary, error) {
	if _, _, err := s.projectAuthz(ctx, actor, projectID); err != nil {
		return RequestLogSummary{}, err
	}
	return s.store.APIRequestLogSummary(ctx, projectID, f)
}

func (s *Service) GetProject(ctx context.Context, actor, projectID string) (Project, error) {
	p, _, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return Project{}, err
	}
	return *p, nil
}

// ── API keys ─────────────────────────────────────────────────────────────────

// PaymentScopes are the scopes gated by the deploy-vs-release control (RT04C §1).
// A scope being in AllowedScopes means it is a valid string, NOT that it may be
// issued to an ordinary external key while the capability is unreleased.
//
// Every scope that touches money belongs here. ADR-050 added three scopes and it
// would have been easy to add them to AllowedScopes alone — which is precisely
// the mistake this comment exists to prevent, because the failure is silent and
// backwards: with the capability unreleased, an ordinary Console key could not
// take a payment, yet could pay funds AWAY via application_settlements:write.
//
// wallet_accounts:read is deliberately NOT here. It lists the caller's own
// project's accounts and moves nothing; withholding it would gate a read behind
// a payment release for no gain.
var PaymentScopes = map[string]bool{
	"payment_sessions:read":  true,
	"payment_sessions:write": true,
	"payment_links:read":     true,
	"payment_links:write":    true,
	// Opens a new financial object under the project's bound owner.
	"wallet_accounts:create": true,
	// Moves money out to a beneficiary — the most consequential of the three.
	"application_settlements:write": true,
	// Returns money from a completed payment. Money-touching, so gated for the
	// same reason: a key that cannot take a payment must not be able to give one
	// back. The read side is not gated — it discloses your own refunds only.
	"refunds:write": true,
	// Moves money between the owner's own accounts. It cannot leave the owner,
	// but it changes which balance settles what, so it is gated with the rest.
	"transfers:write": true,
}

// validScopes checks that every scope is known and, unless allowPayment, that no
// payment scope is present. allowPayment is true only when the payment capability
// is released (public issuance) or for operator-provisioned E2E fixtures.
func validScopes(scopes []string, allowPayment bool) bool {
	for _, sc := range scopes {
		if !AllowedScopes[sc] {
			return false
		}
		if PaymentScopes[sc] && !allowPayment {
			return false
		}
	}
	return true
}

// clientSafeScopes reports whether every scope may be held by a PUBLISHABLE key.
//
// A publishable key ships inside something the user can read, so its scopes are
// a separate question from whether the scope is valid at all. Without this a
// publishable key could be minted with transfers:write — financial write
// authority in an app store download.
func clientSafeScopes(scopes []string) bool {
	for _, sc := range scopes {
		if !ClientSafeScopes[sc] {
			return false
		}
	}
	return true
}

// CreateAPIKey issues a SANDBOX key. The raw secret is returned exactly once (in
// `rawSecret` for SECRET keys); publishable keys carry their full value in the
// returned metadata. The raw secret is never stored, logged or audited.
func (s *Service) CreateAPIKey(ctx context.Context, actor, projectID, kind, name string, scopes []string, ip, reqID string) (APIKey, string, error) {
	p, role, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return APIKey{}, "", err
	}
	if !canBuild(role) {
		return APIKey{}, "", ErrForbidden
	}
	// Public (Console) issuance: payment scopes are allowed ONLY once the payment
	// capability is released (RT04C §1). While unreleased, requesting a payment
	// scope here is rejected — the scope is not selectable to ordinary developers.
	if (kind != KindPublishable && kind != KindSecret) || strings.TrimSpace(name) == "" || !validScopes(scopes, s.paymentReleased) {
		return APIKey{}, "", ErrValidation
	}
	// A publishable key is readable by anyone holding the app it ships in, so it
	// may only carry scopes that are safe in that setting.
	if kind == KindPublishable && !clientSafeScopes(scopes) {
		return APIKey{}, "", ErrValidation
	}
	if s.apiKeyPepper == "" {
		return APIKey{}, "", ErrUnavailable // fail closed
	}
	raw, prefix, err := newAPIKey(kind) // SANDBOX bz_test_ prefixes only
	if err != nil {
		return APIKey{}, "", ErrValidation
	}
	in := APIKeyInsert{
		ProjectID: p.ID, Environment: EnvSandbox, Kind: kind, Name: strings.TrimSpace(name),
		KeyPrefix: prefix, KeyHash: hashKey(raw, s.apiKeyPepper), HashVersion: 1,
		Scopes: scopes, CreatedBy: actor,
	}
	rawSecret := ""
	if kind == KindPublishable {
		in.PublicValue = raw // non-secret, re-displayable
	} else {
		rawSecret = raw // shown once
	}
	key, err := s.store.CreateAPIKey(ctx, in)
	if err != nil {
		return APIKey{}, "", ErrUnavailable
	}
	s.audit(ctx, &actor, &p.WorkspaceID, &p.ID, "apikey.created", "APIKEY:"+key.ID, ip, reqID,
		map[string]any{"kind": kind, "prefix": prefix}) // never the raw key
	return key, rawSecret, nil
}

// CreateFixtureAPIKey issues an operator-controlled SANDBOX SECRET key that MAY
// carry payment scopes even while the payment capability is unreleased (RT04C
// §1). This is the ONLY way payment scopes reach a key before public release, and
// it exists solely so operator-provisioned isolated E2E fixtures can exercise the
// under-test payment path. It is reached only over the internal, X-Internal-Key
// guarded surface (no session actor, no self-service) and is audited as a fixture.
// kind defaults to SECRET; pass KindPublishable to mint a client key. Without
// this the fixture path could only ever produce a secret key, so the
// publishable-key security boundary had no way to be exercised end to end —
// which is how it went unnoticed that a publishable key could carry
// transfers:write.
func (s *Service) CreateFixtureAPIKey(ctx context.Context, projectID, name string, scopes []string, createdBy, ip, reqID string, kind ...string) (APIKey, string, error) {
	// Hard sandbox gate (RT04D §2 item 5): the fixture path is disabled outside a
	// sandbox environment, independent of the internal-key guard. It can never be
	// enabled by a browser flag, URL parameter or generic env toggle.
	if !s.fixturesEnabled {
		return APIKey{}, "", ErrForbidden
	}
	proj, err := s.store.Project(ctx, projectID)
	if err != nil || proj == nil {
		return APIKey{}, "", ErrNotFound
	}
	k := KindSecret
	if len(kind) > 0 && kind[0] == KindPublishable {
		k = KindPublishable
	}
	// allowPayment=true: a fixture key is exactly the controlled test path.
	if strings.TrimSpace(name) == "" || !validScopes(scopes, true) {
		return APIKey{}, "", ErrValidation
	}
	// The client-safety rule is NOT relaxed for fixtures. A fixture may hold
	// payment scopes a released key could not — that is what makes it a test
	// path — but a publishable key that could move money would make the
	// security boundary untestable by making it untrue.
	if k == KindPublishable && !clientSafeScopes(scopes) {
		return APIKey{}, "", ErrValidation
	}
	if s.apiKeyPepper == "" {
		return APIKey{}, "", ErrUnavailable
	}
	raw, prefix, err := newAPIKey(k)
	if err != nil {
		return APIKey{}, "", ErrValidation
	}
	ins := APIKeyInsert{
		ProjectID: proj.ID, Environment: EnvSandbox, Kind: k, Name: strings.TrimSpace(name),
		KeyPrefix: prefix, KeyHash: hashKey(raw, s.apiKeyPepper), HashVersion: 1,
		Scopes: scopes, CreatedBy: createdBy,
	}
	if k == KindPublishable {
		ins.PublicValue = raw
	}
	key, err := s.store.CreateAPIKey(ctx, ins)
	if err != nil {
		return APIKey{}, "", ErrUnavailable
	}
	s.audit(ctx, &createdBy, &proj.WorkspaceID, &proj.ID, "apikey.fixture_created", "APIKEY:"+key.ID, ip, reqID,
		map[string]any{"kind": KindSecret, "prefix": prefix, "e2e_fixture": true})
	return key, raw, nil
}

// CreateFixtureProject provisions a synthetic platform/integrator (workspace +
// project) for isolated Sandbox/Phase-0 E2E fixtures. It is the platform-level
// counterpart to CreateFixtureAPIKey: the ONLY way to mint a Project without a
// Console session, for operator-controlled synthetic testing.
//
// It is hard-gated to a sandbox environment via fixturesEnabled (identical to the
// fixture-key path), independent of the internal-key guard on the route — it can
// never be enabled by a browser flag, URL parameter or generic env toggle. The
// created platform holds no money, computes no balances and issues no receipts;
// it is only an API-integration identity (Project) that a fixture key binds to.
func (s *Service) CreateFixtureProject(ctx context.Context, name, createdBy, ip, reqID string) (Workspace, Project, error) {
	if !s.fixturesEnabled {
		return Workspace{}, Project{}, ErrForbidden
	}
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 80 {
		return Workspace{}, Project{}, ErrValidation
	}
	actor := strings.TrimSpace(createdBy)
	if actor == "" {
		actor = "fixture-operator"
	}
	// CreateWorkspace makes `actor` an OWNER member, which authorizes the
	// subsequent CreateProject role check — no Console session required.
	ws, err := s.CreateWorkspace(ctx, actor, name+" workspace", ip, reqID)
	if err != nil {
		return Workspace{}, Project{}, err
	}
	proj, err := s.CreateProject(ctx, actor, ws.ID, name, ip, reqID)
	if err != nil {
		return Workspace{}, Project{}, err
	}
	return ws, proj, nil
}

// RevokeFixtureKey revokes a fixture API key by id for isolated Sandbox/Phase-0 E2E
// (proves the revoked-key rejection path end-to-end). It is the revoke counterpart to
// CreateFixtureAPIKey: hard sandbox-gated via fixturesEnabled (independent of the
// internal-key guard on the route) — it can never be enabled outside a sandbox
// environment. Not public self-service; operator-controlled fixtures only.
func (s *Service) RevokeFixtureKey(ctx context.Context, keyID, actor, ip, reqID string) error {
	if !s.fixturesEnabled {
		return ErrForbidden
	}
	keyID = strings.TrimSpace(keyID)
	if keyID == "" {
		return ErrValidation
	}
	key, err := s.store.APIKeyByID(ctx, keyID)
	if err != nil || key == nil {
		return ErrNotFound
	}
	if err := s.store.RevokeAPIKey(ctx, keyID); err != nil {
		return err // ErrNotFound when the key is not ACTIVE (already revoked)
	}
	pid := key.ProjectID
	s.audit(ctx, &actor, nil, &pid, "apikey.fixture_revoked", "APIKEY:"+keyID, ip, reqID,
		map[string]any{"e2e_fixture": true})
	return nil
}

// RetireFixtureProject archives a disposable fixture project and revokes every
// key still ACTIVE on it. It is the disposal counterpart to CreateFixtureProject:
// hard sandbox-gated via fixturesEnabled, operator-controlled, never public.
//
// It does NOT touch the project's sandbox binding, and there is deliberately no
// route that does. A binding seals on the first payer-facing artifact and is
// immutable from that moment (ADR-055); adding an unseal or a force-rebind so
// that tests could tidy up would destroy the invariant the tests exist to prove.
// The disposable unit is the project, not its payee, so retiring the project
// disposes of the fixture with the seal intact.
// RetireProject archives a project, revokes its keys and — when the binding
// never issued a payer-facing artifact — disables it.
//
// Distinct from RetireFixtureProject, which is gated on the fixtures flag and
// audits every retirement as an e2e fixture. Retiring a real project that way
// would record a reason that is not true, and an audit trail that says the wrong
// thing about why authority was removed is worse than none.
//
// Operator-scoped: the historical projects this exists for were created by
// bootstrap paths whose workspace owner is not a real Account Identity, so no
// one can reach them through the Console. The reason is required and recorded.
func (s *Service) RetireProject(ctx context.Context, projectID, actor, reason, ip, reqID string) (int, error) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" || strings.TrimSpace(reason) == "" {
		return 0, ErrValidation
	}
	revoked, err := s.store.ArchiveProject(ctx, projectID)
	if err != nil {
		return 0, err
	}
	// actor_user_id is a uuid column. A label like "operator" is not one, and
	// inventing a value to fill the field is how the audit row was rejected while
	// the retirement reported success. An operator action has no Account Identity
	// behind it, so the column is left NULL and the caller is recorded where it
	// can actually be read.
	caller := strings.TrimSpace(actor)
	if caller == "" {
		caller = "operator"
	}
	var actorRef *string
	if isUUID(caller) {
		actorRef = &caller
	}
	s.audit(ctx, actorRef, nil, &projectID, "project.retired", "PROJECT:"+projectID, ip, reqID,
		map[string]any{"reason": reason, "keys_revoked": revoked, "requested_by": caller})
	return revoked, nil
}

func (s *Service) RetireFixtureProject(ctx context.Context, projectID, actor, ip, reqID string) (int, error) {
	if !s.fixturesEnabled {
		return 0, ErrForbidden
	}
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return 0, ErrValidation
	}
	revoked, err := s.store.ArchiveProject(ctx, projectID)
	if err != nil {
		return 0, err // ErrNotFound when it is absent or already archived
	}
	if strings.TrimSpace(actor) == "" {
		actor = "fixture-operator"
	}
	s.audit(ctx, &actor, nil, &projectID, "project.fixture_retired", "PROJECT:"+projectID, ip, reqID,
		map[string]any{"e2e_fixture": true, "keys_revoked": revoked})
	return revoked, nil
}

func (s *Service) ListAPIKeys(ctx context.Context, actor, projectID string) ([]APIKey, error) {
	if _, _, err := s.projectAuthz(ctx, actor, projectID); err != nil {
		return nil, err
	}
	return s.store.APIKeysForProject(ctx, projectID) // metadata only
}

func (s *Service) keyAuthz(ctx context.Context, actor, keyID string) (*APIKey, *Project, error) {
	key, err := s.store.APIKeyByID(ctx, keyID)
	if err != nil || key == nil {
		return nil, nil, ErrNotFound
	}
	p, role, err := s.projectAuthz(ctx, actor, key.ProjectID)
	if err != nil {
		return nil, nil, err
	}
	if !canBuild(role) {
		return nil, nil, ErrForbidden
	}
	return key, p, nil
}

func (s *Service) RevokeAPIKey(ctx context.Context, actor, keyID, ip, reqID string) error {
	key, p, err := s.keyAuthz(ctx, actor, keyID)
	if err != nil {
		return err
	}
	if err := s.store.RevokeAPIKey(ctx, key.ID); err != nil {
		return ErrNotFound
	}
	s.audit(ctx, &actor, &p.WorkspaceID, &p.ID, "apikey.revoked", "APIKEY:"+key.ID, ip, reqID, nil)
	return nil
}

// RotateAPIKey atomically issues a replacement (same kind/scopes) and revokes the
// old key. The old key is immediately rejected by AuthorizeKey.
func (s *Service) RotateAPIKey(ctx context.Context, actor, keyID, ip, reqID string) (APIKey, string, error) {
	key, p, err := s.keyAuthz(ctx, actor, keyID)
	if err != nil {
		return APIKey{}, "", err
	}
	if s.apiKeyPepper == "" {
		return APIKey{}, "", ErrUnavailable
	}
	raw, prefix, err := newAPIKey(key.Kind)
	if err != nil {
		return APIKey{}, "", ErrValidation
	}
	old := key.ID
	in := APIKeyInsert{
		ProjectID: key.ProjectID, Environment: EnvSandbox, Kind: key.Kind, Name: key.Name,
		KeyPrefix: prefix, KeyHash: hashKey(raw, s.apiKeyPepper), HashVersion: 1,
		Scopes: key.Scopes, CreatedBy: actor, RotatedFrom: &old,
	}
	rawSecret := ""
	if key.Kind == KindPublishable {
		in.PublicValue = raw
	} else {
		rawSecret = raw
	}
	nk, err := s.store.RotateAPIKey(ctx, old, in)
	if err != nil {
		return APIKey{}, "", ErrUnavailable
	}
	s.audit(ctx, &actor, &p.WorkspaceID, &p.ID, "apikey.rotated", "APIKEY:"+nk.ID, ip, reqID,
		map[string]any{"rotated_from": old})
	return nk, rawSecret, nil
}

// AuthorizeKey resolves a presented raw key to its authorization. Rejects Live
// prefixes outright (never issued in Slice 1), revoked/rotated/inactive keys,
// non-sandbox keys, and missing scopes. This is where scope + revoke + rotate +
// sandbox-only enforcement live.
func (s *Service) AuthorizeKey(ctx context.Context, rawKey, requiredScope string) (*APIKeyAuth, error) {
	if strings.HasPrefix(rawKey, PrefixLivePub) || strings.HasPrefix(rawKey, PrefixLiveSec) {
		return nil, ErrForbidden // live keys have no path in Slice 1
	}
	if s.apiKeyPepper == "" {
		return nil, ErrUnavailable
	}
	auth, err := s.store.APIKeyByHash(ctx, hashKey(rawKey, s.apiKeyPepper))
	if err != nil || auth == nil {
		return nil, ErrForbidden
	}
	if auth.Status != "ACTIVE" || auth.Environment != EnvSandbox {
		return nil, ErrForbidden // revoked / rotated-away / non-sandbox
	}
	if requiredScope != "" {
		ok := false
		for _, sc := range auth.Scopes {
			if sc == requiredScope {
				ok = true
				break
			}
		}
		if !ok {
			return nil, ErrForbidden
		}
	}
	s.touchKeyUsed(auth.ID)
	return auth, nil
}

// touchKeyUsed records a successful presentation of a key, best-effort.
//
// Deliberately after every check, so last_used_at answers "when did this key
// last work", not "when was this string last guessed at" — a rejected key that
// stamped a timestamp would make a brute-force attempt look like legitimate
// traffic and, worse, make a revoked key look live.
//
// Detached from the request: its context is already on its way out when the
// handler returns, and a caller must never wait on, or fail because of, a
// telemetry write. Errors are dropped for the same reason — the key is
// authorised either way, and a Console timestamp is not worth a 500.
func (s *Service) touchKeyUsed(keyID string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = s.store.TouchAPIKeyUsed(ctx, keyID)
	}()
}

// ── project→merchant sandbox binding (ADR-047) ───────────────────────────────

// BindProjectSandbox records an operator-provisioned Project→Merchant SANDBOX
// binding. This is an OPERATOR action (invoked over the internal, X-Internal-Key
// guarded surface) — never public self-service. The caller supplies opaque core
// ids (merchant/wallet/wallet_account) it already provisioned in Core; this
// method only records + authorizes the binding, enforcing one ACTIVE binding per
// project (the DB partial-unique index is the hard guarantee; ErrConflict here).
// It never overwrites an existing ACTIVE binding — rebinding is a separate,
// audited operation and is refused once a payment artifact exists.
func (s *Service) BindProjectSandbox(ctx context.Context, projectID, merchantID, walletID, walletAccountID, actorUserID, ip, reqID string) (SandboxBinding, error) {
	if projectID == "" || merchantID == "" || walletID == "" || walletAccountID == "" || actorUserID == "" {
		return SandboxBinding{}, ErrValidation
	}
	proj, err := s.store.Project(ctx, projectID)
	if err != nil || proj == nil {
		return SandboxBinding{}, ErrNotFound
	}
	// Core is independently authoritative for the payee relationship. Fail closed:
	// no validator configured, Core unavailable, or an invalid/inactive/non-sandbox
	// payee → no binding is recorded. This is what stops arbitrary submitted Core
	// ids (cross-merchant wallet, inactive account, Live identity) from binding.
	if s.payee == nil {
		return SandboxBinding{}, ErrUnavailable
	}
	valid, reason, verr := s.payee.ValidatePayee(ctx, merchantID, walletID, walletAccountID)
	if verr != nil {
		return SandboxBinding{}, ErrUnavailable
	}
	if !valid {
		s.audit(ctx, &actorUserID, &proj.WorkspaceID, &projectID, "project.sandbox_bind_rejected",
			"PROJECT:"+projectID, ip, reqID, map[string]any{"reason": reason})
		return SandboxBinding{}, ErrValidation
	}
	b, err := s.store.CreateBinding(ctx, BindingInsert{
		ProjectID: projectID, MerchantID: merchantID, WalletID: walletID,
		WalletAccountID: walletAccountID, CreatedByUserID: actorUserID,
	})
	if err == ErrConflict {
		return SandboxBinding{}, ErrConflict
	}
	if err != nil {
		return SandboxBinding{}, ErrUnavailable
	}
	// Audit records only non-secret ids (merchant/wallet are opaque core ids).
	s.audit(ctx, &actorUserID, &proj.WorkspaceID, &projectID, "project.sandbox_bound",
		"BINDING:"+b.ID, ip, reqID, map[string]any{"merchant_id": merchantID, "wallet_account_id": walletAccountID})
	return b, nil
}

// RebindProjectSandbox corrects a project's payee binding.
//
// Binding used to be a one-way door: CreateBinding conflicts on the
// one-ACTIVE-per-project index and nothing ever set a binding to DISABLED, so a
// project bound to the wrong merchant stayed bound to it forever. That is how
// DOA came to resolve @e2edoa17885371237909198 — an E2E fixture — with no
// supported way back.
//
// The correction is deliberately narrow:
//
//   - the new payee is validated by Core exactly as a first binding is, so a
//     rebind can no more name a foreign wallet than a bind can;
//   - a SEALED binding is refused. Once a payment artifact exists under it the
//     payee can never change (ADR-047 §3.2) — correcting a mistake before any
//     money moved is not the same as reattributing money that already did;
//   - the swap is one transaction, so the project is never left unbound;
//   - both binding ids are audited, so the change has a before and an after.
func (s *Service) RebindProjectSandbox(ctx context.Context, projectID, merchantID, walletID, walletAccountID, actorUserID, ip, reqID string) (SandboxBinding, string, error) {
	if projectID == "" || merchantID == "" || walletID == "" || walletAccountID == "" || actorUserID == "" {
		return SandboxBinding{}, "", ErrValidation
	}
	proj, err := s.store.Project(ctx, projectID)
	if err != nil || proj == nil {
		return SandboxBinding{}, "", ErrNotFound
	}
	current, err := s.store.ActiveBindingForProject(ctx, projectID)
	if err != nil {
		return SandboxBinding{}, "", ErrUnavailable
	}
	if current != nil && current.ArtifactCreated {
		s.audit(ctx, &actorUserID, &proj.WorkspaceID, &projectID, "project.sandbox_rebind_rejected",
			"BINDING:"+current.ID, ip, reqID, map[string]any{"reason": "SEALED"})
		return SandboxBinding{}, "", ErrConflict
	}
	if s.payee == nil {
		return SandboxBinding{}, "", ErrUnavailable
	}
	valid, reason, verr := s.payee.ValidatePayee(ctx, merchantID, walletID, walletAccountID)
	if verr != nil {
		return SandboxBinding{}, "", ErrUnavailable
	}
	if !valid {
		s.audit(ctx, &actorUserID, &proj.WorkspaceID, &projectID, "project.sandbox_rebind_rejected",
			"PROJECT:"+projectID, ip, reqID, map[string]any{"reason": reason})
		return SandboxBinding{}, "", ErrValidation
	}
	b, superseded, err := s.store.SupersedeAndCreateBinding(ctx, BindingInsert{
		ProjectID: projectID, MerchantID: merchantID, WalletID: walletID,
		WalletAccountID: walletAccountID, CreatedByUserID: actorUserID,
	})
	if err == ErrConflict {
		return SandboxBinding{}, "", ErrConflict
	}
	if err != nil {
		return SandboxBinding{}, "", ErrUnavailable
	}
	s.audit(ctx, &actorUserID, &proj.WorkspaceID, &projectID, "project.sandbox_rebound",
		"BINDING:"+b.ID, ip, reqID, map[string]any{
			"merchant_id": merchantID, "wallet_account_id": walletAccountID,
			"superseded_binding_id": superseded,
		})
	return b, superseded, nil
}

// Sealing lives in the api-gateway (ADR-055), not here.
//
// A service-level SealBindingArtifact used to exist in this file and was never
// called by anything. It read as the enforced immutability guarantee and set no
// state, which is worse than an honest absence — the column it wrote was the
// one everything else trusted.
//
// The canonical seal is now a single atomic UPDATE in
// services/api-gateway/internal/service/binding_seal.go, issued on the same
// request that creates the payment artifact and gated on the payee still being
// the ACTIVE binding. There is exactly one sealing mechanism, and it is the one
// that can see the artifact it is sealing for.

// audit records what happened. Fire-and-forget by design — an audit failure must
// not fail the operation it describes — but never SILENT.
//
// The error used to be discarded. A retirement then reported success while its
// audit row was rejected (actor_user_id is a uuid and the caller had passed a
// label), so the operation looked recorded and was not. An audit that can fail
// quietly is worse than none: it is the record you would trust later.
func (s *Service) audit(ctx context.Context, actor, wsID, projID *string, action, subject, ip, reqID string, meta map[string]any) {
	if err := s.store.InsertAudit(ctx, AuditEvent{
		ActorUserID: actor, WorkspaceID: wsID, ProjectID: projID,
		Action: action, Subject: subject, Metadata: meta, RequestIP: ip, RequestID: reqID,
	}); err != nil {
		slog.ErrorContext(ctx, "developer.audit.insert_failed",
			"action", action, "subject", subject, "err", err.Error())
	}
}

// KeyIntrospection is the resolved authorization context of a verified external
// developer key (ADR-046). It carries no raw secret. WorkspaceID/ProjectID are
// internal (used by the Gateway for future tenant enforcement) and MUST NOT be
// exposed on the public /v1/me contract; ProjectSlug is the project-safe public
// identifier.
type KeyIntrospection struct {
	KeyID       string `json:"key_id"`
	Environment string `json:"environment"`
	WorkspaceID string `json:"workspace_id"`
	ProjectID   string `json:"project_id"`
	ProjectSlug string `json:"project_slug"`
	// ProjectName is the display name — what the Console shows. With the id and
	// the slug it is the public Project identity /v1/me reports.
	ProjectName string   `json:"project_name"`
	KeyStatus   string   `json:"key_status"`
	Scopes      []string `json:"scopes"`

	// Sealed mirrors the binding's ADR-055 seal: a payer-facing artifact has been
	// issued against the destination, so it can no longer change. Reported so a
	// Project key can see the state of its own Financial Setup.
	Sealed bool `json:"sealed"`

	// Binding (ADR-047) — the operator-provisioned SANDBOX payee for this key's
	// Project, or nil when the Project is not yet bound. These are OPAQUE core
	// ids the Gateway uses to derive the payee; they are INTERNAL and MUST NOT be
	// exposed on any payer-facing response. `Bound` lets the Gateway distinguish
	// "no binding" (→ payments unavailable) from a resolved payee.
	Bound           bool   `json:"bound"`
	MerchantID      string `json:"merchant_id,omitempty"`
	WalletID        string `json:"wallet_id,omitempty"`
	WalletAccountID string `json:"wallet_account_id,omitempty"`
}

// IntrospectKey verifies a presented raw key against the canonical dev-key
// authority and resolves its full context (ADR-046). This is what the Gateway
// delegates to — no key material is copied out of developer-api. Returns
// ErrForbidden for unknown/revoked/rotated-away/live/non-sandbox keys.
func (s *Service) IntrospectKey(ctx context.Context, rawKey string) (*KeyIntrospection, error) {
	auth, err := s.AuthorizeKey(ctx, rawKey, "") // validates active + sandbox + not-live
	if err != nil {
		return nil, err
	}
	proj, err := s.store.Project(ctx, auth.ProjectID)
	if err != nil || proj == nil {
		return nil, ErrForbidden
	}
	out := &KeyIntrospection{
		KeyID:       auth.ID,
		Environment: auth.Environment,
		WorkspaceID: proj.WorkspaceID,
		ProjectID:   auth.ProjectID,
		ProjectSlug: proj.Slug,
		ProjectName: proj.Name,
		KeyStatus:   "active", // AuthorizeKey already required status == ACTIVE
		Scopes:      auth.Scopes,
	}
	// Attach the Project's ACTIVE payee binding (ADR-047) when present. A missing
	// binding is NOT an auth failure — the key is valid but cannot transact until
	// the operator binds a payee (the Gateway turns Bound=false into a controlled
	// "payments unavailable", never a default/fallback merchant).
	if b, berr := s.store.ActiveBindingForProject(ctx, auth.ProjectID); berr == nil && b != nil {
		out.Bound = true
		out.MerchantID = b.MerchantID
		out.WalletID = b.WalletID
		out.WalletAccountID = b.WalletAccountID
		out.Sealed = b.ArtifactCreated
	}
	return out, nil
}

// isUUID reports whether s has the canonical 8-4-4-4-12 hexadecimal shape.
//
// A shape check, not a parser: the only question here is whether a value can go
// into a uuid column at all. Adding a dependency to answer it would put a module
// in the build for one format test.
func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, c := range s {
		switch i {
		case 8, 13, 18, 23:
			if c != '-' {
				return false
			}
		default:
			isHex := (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
			if !isHex {
				return false
			}
		}
	}
	return true
}
