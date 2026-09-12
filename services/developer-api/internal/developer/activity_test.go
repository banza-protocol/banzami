package developer

import (
	"strings"
	"testing"
	"time"
)

// The four properties Workspace Activity has to hold, each asked of the service
// rather than of the query — an isolation rule that only exists in SQL is a rule
// nobody can see when they add the next caller.

func TestWorkspaceActivity_AnswersWhoChangedWhat(t *testing.T) {
	s, _ := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	addMember(t, s, "u_owner", ws.ID, "dev@x.co", RoleDeveloper, "u_dev")
	if err := s.SetMemberRole(bg, "u_owner", ws.ID, "u_dev", RoleViewer, "", ""); err != nil {
		t.Fatal(err)
	}

	page, err := s.WorkspaceActivity(bg, "u_owner", ws.ID, "", "")
	if err != nil {
		t.Fatalf("owner reading own workspace activity: %v", err)
	}

	var change *ActivityEvent
	for i := range page.Events {
		if page.Events[i].Action == "member.role_changed" {
			change = &page.Events[i]
		}
	}
	if change == nil {
		t.Fatal("the role change was recorded and is not readable")
	}
	// The whole point of the surface: both halves of the transition, and who.
	if change.PreviousRole != RoleDeveloper || change.Role != RoleViewer {
		t.Errorf("role transition: want DEVELOPER→VIEWER, got %q→%q", change.PreviousRole, change.Role)
	}
	if change.ActorUserID != "u_owner" {
		t.Errorf("actor: want u_owner, got %q", change.ActorUserID)
	}
	if change.TargetKind != "USER" || change.TargetRef != "u_dev" {
		t.Errorf("target: want USER:u_dev, got %s:%s", change.TargetKind, change.TargetRef)
	}
}

func TestWorkspaceActivity_NeverCrossesWorkspaces(t *testing.T) {
	s, _ := newSvc(time.Hour)
	a, _ := s.CreateWorkspace(bg, "u_a", "A", "", "")
	b, _ := s.CreateWorkspace(bg, "u_b", "B", "", "")
	addMember(t, s, "u_b", b.ID, "secret@b.co", RoleDeveloper, "u_b_dev")

	// A's owner reading A's history must not see one row of B's.
	page, err := s.WorkspaceActivity(bg, "u_a", a.ID, "", "")
	if err != nil {
		t.Fatal(err)
	}
	for _, ev := range page.Events {
		if strings.Contains(ev.TargetEmail, "@b.co") || ev.TargetRef == "u_b_dev" || ev.ActorUserID == "u_b" {
			t.Fatalf("WORKSPACE_AUDIT_CROSS_TENANT_DISCLOSURE: A's activity carries B's event %+v", ev)
		}
	}
	// And asking for B's history by id is refused outright, not filtered.
	if _, err := s.WorkspaceActivity(bg, "u_a", b.ID, "", ""); err != ErrForbidden {
		t.Fatalf("reading another workspace's activity: want Forbidden, got %v", err)
	}
}

func TestWorkspaceActivity_ManagersOnly(t *testing.T) {
	s, _ := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	addMember(t, s, "u_owner", ws.ID, "viewer@x.co", RoleViewer, "u_viewer")
	addMember(t, s, "u_owner", ws.ID, "admin@x.co", RoleAdmin, "u_admin")

	if _, err := s.WorkspaceActivity(bg, "u_viewer", ws.ID, "", ""); err != ErrForbidden {
		t.Errorf("VIEWER: want Forbidden, got %v", err)
	}
	if _, err := s.WorkspaceActivity(bg, "u_stranger", ws.ID, "", ""); err != ErrForbidden {
		t.Errorf("non-member: want Forbidden, got %v", err)
	}
	if _, err := s.WorkspaceActivity(bg, "u_admin", ws.ID, "", ""); err != nil {
		t.Errorf("ADMIN: want access, got %v", err)
	}
}

// A key's prefix, an IP and a request id are all written to audit_events, and
// none of them may reach this surface. The test asserts the projection, not the
// current contents of the table: a field is served because it is named in the
// allow-list, so anything else must come back empty however it was written.
func TestWorkspaceActivity_ServesNoSecretOrOperationalField(t *testing.T) {
	s, _ := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")

	actor, wsID := "u_owner", ws.ID
	s.audit(bg, &actor, &wsID, nil, "apikey.created", "APIKEY:k_1", "203.0.113.9", "req_42",
		map[string]any{"role": RoleViewer, "prefix": "bz_test_sk_ABCDEFGH", "kind": "SECRET"})

	page, err := s.WorkspaceActivity(bg, "u_owner", ws.ID, "", "")
	if err != nil {
		t.Fatal(err)
	}
	var seen bool
	for _, ev := range page.Events {
		if ev.Action != "apikey.created" {
			continue
		}
		seen = true
		if ev.Role != RoleViewer {
			t.Errorf("allow-listed metadata should pass: role = %q", ev.Role)
		}
	}
	if !seen {
		t.Fatal("the apikey.created event was written and is not readable")
	}
	// Nothing in the rendered page may carry the prefix, the IP or the request id.
	rendered := renderPage(page)
	for _, forbidden := range []string{"bz_test_sk_ABCDEFGH", "203.0.113.9", "req_42", "SECRET"} {
		if strings.Contains(rendered, forbidden) {
			t.Errorf("WORKSPACE_AUDIT_SECRET_DISCLOSURE: %q reached the activity projection", forbidden)
		}
	}
}

// An action nobody put on the allow-list must not appear, even though the audit
// table happily accepted it.
func TestWorkspaceActivity_ServesOnlyAllowListedActions(t *testing.T) {
	s, _ := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	actor, wsID := "u_owner", ws.ID
	s.audit(bg, &actor, &wsID, nil, "account.otp_verified", "USER:u_owner", "", "", nil)

	page, err := s.WorkspaceActivity(bg, "u_owner", ws.ID, "", "")
	if err != nil {
		t.Fatal(err)
	}
	for _, ev := range page.Events {
		if ev.Action == "account.otp_verified" {
			t.Fatal("WORKSPACE_AUDIT_PERSONAL_SESSION_DISCLOSURE: an action outside the allow-list was served")
		}
	}
}

// "Log de acesso por membro legível" is a per-PERSON question, so it must be
// answered by the query and not by the page: a filter applied to whatever fifty
// rows came back would answer "nothing happened to this person" whenever their
// history is older than the first page.
func TestWorkspaceActivity_PerMemberHistory(t *testing.T) {
	s, _ := newSvc(time.Hour)
	ws, _ := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	addMember(t, s, "u_owner", ws.ID, "dev@x.co", RoleDeveloper, "u_dev")
	addMember(t, s, "u_owner", ws.ID, "other@x.co", RoleDeveloper, "u_other")
	if err := s.SetMemberRole(bg, "u_owner", ws.ID, "u_dev", RoleViewer, "", ""); err != nil {
		t.Fatal(err)
	}

	page, err := s.WorkspaceActivity(bg, "u_owner", ws.ID, "u_dev", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Events) == 0 {
		t.Fatal("the member has a history and the filter returned none of it")
	}
	var joined, changed bool
	for _, ev := range page.Events {
		// Both sides of the person: what they did, and what was done to them.
		if ev.ActorUserID != "u_dev" && ev.TargetRef != "u_dev" {
			t.Errorf("an event about somebody else survived the member filter: %+v", ev)
		}
		joined = joined || ev.Action == "member.joined"
		changed = changed || ev.Action == "member.role_changed"
	}
	if !joined {
		t.Error("what the member did (member.joined) is missing from their own history")
	}
	if !changed {
		t.Error("what was done to the member (member.role_changed) is missing from their own history")
	}

	// A filter that names nobody returns nothing, rather than everything.
	empty, err := s.WorkspaceActivity(bg, "u_owner", ws.ID, "u_nobody", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(empty.Events) != 0 {
		t.Errorf("filtering by a stranger: want no events, got %d", len(empty.Events))
	}
}

func TestActivityCursor_RoundTripsAndRefusesGarbage(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Microsecond)
	back, err := decodeActivityCursor(encodeActivityCursor(now))
	if err != nil || back == nil || !back.Equal(now) {
		t.Fatalf("round trip: got %v, %v", back, err)
	}
	if c, err := decodeActivityCursor("  "); err != nil || c != nil {
		t.Errorf("empty cursor means the first page: got %v, %v", c, err)
	}
	for _, bad := range []string{"not-base64!!", "Zm9vYmFy"} {
		if _, err := decodeActivityCursor(bad); err == nil {
			t.Errorf("%q: a cursor that is not one must be refused, not treated as page one", bad)
		}
	}
}

func renderPage(p ActivityPage) string {
	var b strings.Builder
	for _, ev := range p.Events {
		b.WriteString(strings.Join([]string{
			ev.ID, ev.Action, ev.ActorUserID, ev.ActorName, ev.ActorEmail,
			ev.TargetKind, ev.TargetRef, ev.TargetName, ev.TargetEmail,
			ev.Role, ev.PreviousRole,
		}, "|"))
	}
	return b.String()
}
