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
	inviteTTL    time.Duration
}

func NewService(store Store, inviteSecret string, inviteTTL time.Duration) *Service {
	if inviteTTL == 0 {
		inviteTTL = 7 * 24 * time.Hour
	}
	return &Service{store: store, inviteSecret: inviteSecret, inviteTTL: inviteTTL}
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

func (s *Service) audit(ctx context.Context, actor, wsID, projID *string, action, subject, ip, reqID string, meta map[string]any) {
	_ = s.store.InsertAudit(ctx, AuditEvent{
		ActorUserID: actor, WorkspaceID: wsID, ProjectID: projID,
		Action: action, Subject: subject, Metadata: meta, RequestIP: ip, RequestID: reqID,
	})
}
