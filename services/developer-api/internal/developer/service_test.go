package developer

import (
	"context"
	"testing"
	"time"
)

func newSvc(ttl time.Duration) (*Service, *memStore) {
	st := NewMemStore()
	return NewService(st, "invite-secret", ttl), st
}

var bg = context.Background()

// addMember drives the real invite→accept flow so tests exercise the authz path.
func addMember(t *testing.T, s *Service, owner, wsID, email, role, joinUser string) {
	t.Helper()
	_, raw, err := s.InviteMember(bg, owner, wsID, email, role, "", "")
	if err != nil {
		t.Fatalf("invite %s as %s: %v", email, role, err)
	}
	if _, err := s.AcceptInvite(bg, joinUser, email, raw, "", ""); err != nil {
		t.Fatalf("accept %s: %v", email, err)
	}
}

func TestCreateWorkspace_MakesOwner(t *testing.T) {
	s, _ := newSvc(time.Hour)
	ws, err := s.CreateWorkspace(bg, "u_owner", "Minha Loja", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetWorkspace(bg, "u_owner", ws.ID); err != nil {
		t.Fatalf("owner should access own workspace: %v", err)
	}
}

func TestCrossWorkspaceAccessDenied(t *testing.T) {
	s, _ := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	// A user with no membership must be denied read + management.
	if _, err := s.GetWorkspace(bg, "u_outsider", ws.ID); err != ErrForbidden {
		t.Errorf("GetWorkspace: want Forbidden, got %v", err)
	}
	if _, err := s.ListMembers(bg, "u_outsider", ws.ID); err != ErrForbidden {
		t.Errorf("ListMembers: want Forbidden, got %v", err)
	}
	if _, _, err := s.InviteMember(bg, "u_outsider", ws.ID, "x@x.co", RoleDeveloper, "", ""); err != ErrForbidden {
		t.Errorf("InviteMember: want Forbidden, got %v", err)
	}
}

func TestRoleEscalationDenied(t *testing.T) {
	s, _ := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	addMember(t, s, "u_owner", ws.ID, "admin@x.co", RoleAdmin, "u_admin")

	// ADMIN cannot invite/assign OWNER or ADMIN.
	if _, _, err := s.InviteMember(bg, "u_admin", ws.ID, "c@x.co", RoleOwner, "", ""); err != ErrForbidden {
		t.Errorf("admin invite OWNER: want Forbidden, got %v", err)
	}
	if _, _, err := s.InviteMember(bg, "u_admin", ws.ID, "c@x.co", RoleAdmin, "", ""); err != ErrForbidden {
		t.Errorf("admin invite ADMIN: want Forbidden, got %v", err)
	}
	// ADMIN cannot modify an OWNER.
	if err := s.SetMemberRole(bg, "u_admin", ws.ID, "u_owner", RoleViewer, "", ""); err != ErrForbidden {
		t.Errorf("admin demote owner: want Forbidden, got %v", err)
	}
	// ADMIN may invite a non-privileged role.
	if _, _, err := s.InviteMember(bg, "u_admin", ws.ID, "dev@x.co", RoleDeveloper, "", ""); err != nil {
		t.Errorf("admin invite DEVELOPER should succeed: %v", err)
	}
}

func TestLastOwnerProtected(t *testing.T) {
	s, _ := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	// Cannot remove or demote the sole owner.
	if err := s.RemoveMember(bg, "u_owner", ws.ID, "u_owner", "", ""); err != ErrLastOwner {
		t.Errorf("remove last owner: want ErrLastOwner, got %v", err)
	}
	if err := s.SetMemberRole(bg, "u_owner", ws.ID, "u_owner", RoleAdmin, "", ""); err != ErrLastOwner {
		t.Errorf("demote last owner: want ErrLastOwner, got %v", err)
	}
	// With a second owner, removing one is allowed.
	addMember(t, s, "u_owner", ws.ID, "o2@x.co", RoleOwner, "u_owner2")
	if err := s.RemoveMember(bg, "u_owner", ws.ID, "u_owner2", "", ""); err != nil {
		t.Errorf("remove non-last owner: %v", err)
	}
}

func TestDuplicateActiveInviteRejected(t *testing.T) {
	s, _ := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	if _, _, err := s.InviteMember(bg, "u_owner", ws.ID, "dev@x.co", RoleDeveloper, "", ""); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.InviteMember(bg, "u_owner", ws.ID, "DEV@x.co", RoleDeveloper, "", ""); err != ErrConflict {
		t.Errorf("duplicate active invite: want ErrConflict, got %v", err)
	}
}

func TestExpiredInviteRejected(t *testing.T) {
	s, _ := newSvc(-time.Hour) // invites are already expired
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	_, raw, err := s.InviteMember(bg, "u_owner", ws.ID, "dev@x.co", RoleDeveloper, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.AcceptInvite(bg, "u_dev", "dev@x.co", raw, "", ""); err != ErrInviteState {
		t.Errorf("expired invite: want ErrInviteState, got %v", err)
	}
}

func TestRevokedInviteRejected(t *testing.T) {
	s, _ := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	inv, raw, _ := s.InviteMember(bg, "u_owner", ws.ID, "dev@x.co", RoleDeveloper, "", "")
	if err := s.RevokeInvite(bg, "u_owner", ws.ID, inv.ID, "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AcceptInvite(bg, "u_dev", "dev@x.co", raw, "", ""); err != ErrInviteState {
		t.Errorf("revoked invite: want ErrInviteState, got %v", err)
	}
}

func TestInviteBoundToEmail(t *testing.T) {
	s, _ := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	_, raw, _ := s.InviteMember(bg, "u_owner", ws.ID, "dev@x.co", RoleDeveloper, "", "")
	// A different email cannot accept the invite.
	if _, err := s.AcceptInvite(bg, "u_evil", "evil@x.co", raw, "", ""); err != ErrForbidden {
		t.Errorf("wrong-email accept: want Forbidden, got %v", err)
	}
	// The bound email accepts fine.
	if _, err := s.AcceptInvite(bg, "u_dev", "dev@x.co", raw, "", ""); err != nil {
		t.Errorf("bound-email accept: %v", err)
	}
}

func TestAuditWrittenForMembershipChanges(t *testing.T) {
	s, st := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	addMember(t, s, "u_owner", ws.ID, "dev@x.co", RoleDeveloper, "u_dev")
	actions := map[string]bool{}
	for _, e := range st.Audits {
		actions[e.Action] = true
	}
	for _, want := range []string{"workspace.created", "member.invited", "member.joined"} {
		if !actions[want] {
			t.Errorf("missing audit action %q", want)
		}
	}
}
