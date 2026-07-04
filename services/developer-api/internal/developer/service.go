package developer

import (
	"context"
	"strings"
	"time"
)

// Service enforces the Developer-domain authorization matrix over a Store. Every
// call takes the authenticated actor's user id (from Account Identity); no
// client-supplied workspace/user id is trusted without a membership check.
type Service struct {
	store        Store
	inviteSecret string
	apiKeyPepper string
	inviteTTL    time.Duration
}

func NewService(store Store, inviteSecret, apiKeyPepper string, inviteTTL time.Duration) *Service {
	if inviteTTL == 0 {
		inviteTTL = 7 * 24 * time.Hour
	}
	return &Service{store: store, inviteSecret: inviteSecret, apiKeyPepper: apiKeyPepper, inviteTTL: inviteTTL}
}

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
		return nil, "", ErrForbidden // cross-workspace project access denied
	}
	return p, role, nil
}

func (s *Service) GetProject(ctx context.Context, actor, projectID string) (Project, error) {
	p, _, err := s.projectAuthz(ctx, actor, projectID)
	if err != nil {
		return Project{}, err
	}
	return *p, nil
}

// ── API keys ─────────────────────────────────────────────────────────────────

func validScopes(scopes []string) bool {
	for _, sc := range scopes {
		if !AllowedScopes[sc] {
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
	if (kind != KindPublishable && kind != KindSecret) || strings.TrimSpace(name) == "" || !validScopes(scopes) {
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
	return auth, nil
}

func (s *Service) audit(ctx context.Context, actor, wsID, projID *string, action, subject, ip, reqID string, meta map[string]any) {
	_ = s.store.InsertAudit(ctx, AuditEvent{
		ActorUserID: actor, WorkspaceID: wsID, ProjectID: projID,
		Action: action, Subject: subject, Metadata: meta, RequestIP: ip, RequestID: reqID,
	})
}

// KeyIntrospection is the resolved authorization context of a verified external
// developer key (ADR-046). It carries no raw secret.
type KeyIntrospection struct {
	KeyID       string   `json:"key_id"`
	Environment string   `json:"environment"`
	WorkspaceID string   `json:"workspace_id"`
	ProjectID   string   `json:"project_id"`
	Scopes      []string `json:"scopes"`
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
	return &KeyIntrospection{
		KeyID:       auth.ID,
		Environment: auth.Environment,
		WorkspaceID: proj.WorkspaceID,
		ProjectID:   auth.ProjectID,
		Scopes:      auth.Scopes,
	}, nil
}
