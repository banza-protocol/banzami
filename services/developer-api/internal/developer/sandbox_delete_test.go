// Sandbox deletion (SANDBOX-DELETE-001): a developer deletes a Project or a
// Workspace whatever it has done, authority ends in the same transaction that
// accepts the deletion, test resources are retired in Core however many passes
// it takes, and nothing reaches another tenant.
//
// Mutation targets: move the key revocation out of BeginProjectDeletion (into the
// Core pass) and TestSandboxDelete_AuthorityEndsBeforeCleanup fails; restore the
// history check and TestSandboxDelete_AProjectWithHistoryIsDeleted fails; drop the
// other-live-projects count and TestSandboxDelete_ASharedBusinessIsNotRetired
// fails; drop the workspace predicate in BeginWorkspaceDeletion and
// TestSandboxDelete_AnotherWorkspaceIsUntouched fails.
package developer

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/banzami/banzami/services/developer-api/internal/coreclient"
)

type retirePass struct {
	projectID      string
	retireBusiness bool
	bound          string
}

type fakeRetirer struct {
	fakeSandboxBusinesses
	mu     sync.Mutex
	passes []retirePass
	down   bool
}

func (f *fakeRetirer) RetireProject(_ context.Context, projectID, _, _ string, retireBusiness bool, bound string) (*coreclient.ProjectRetirement, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.down {
		return nil, coreclient.ErrUnavailable
	}
	f.passes = append(f.passes, retirePass{projectID, retireBusiness, bound})
	return &coreclient.ProjectRetirement{BusinessRetired: retireBusiness}, nil
}

func (f *fakeRetirer) passesFor(id string) []retirePass {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []retirePass
	for _, p := range f.passes {
		if p.projectID == id {
			out = append(out, p)
		}
	}
	return out
}

func sandboxSvc(t *testing.T) (*Service, *memStore, *fakeRetirer, string) {
	t.Helper()
	s, st, ws := wsWithRoles(t)
	s.SetSandboxEnvironment(true)
	r := &fakeRetirer{}
	s.SetSandboxBusinessProvisioner(r)
	prev := DeletionGrace
	DeletionGrace = time.Hour
	t.Cleanup(func() { DeletionGrace = prev })
	return s, st, r, ws
}

// A project with a key, a binding and request history.
func projectWithHistory(t *testing.T, s *Service, st *memStore, ws, name, merchant string) (*Project, string) {
	t.Helper()
	p, err := s.CreateProject(bg, "u_owner", ws, name, "", "")
	if err != nil {
		t.Fatal(err)
	}
	_, raw, err := s.CreateAPIKey(bg, "u_owner", p.ID, KindSecret, "k", []string{"identity:read"}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.CreateBinding(bg, BindingInsert{ProjectID: p.ID, MerchantID: merchant, WalletID: "w", WalletAccountID: "wa", CreatedByUserID: "u_owner"}); err != nil {
		t.Fatal(err)
	}
	st.requestLogs = append(st.requestLogs, memRequestLog{projectID: p.ID})
	return &p, raw
}

func finishAll(t *testing.T, s *Service) {
	t.Helper()
	DeletionGrace = 0
	s.ResumeDeletions(bg)
}

func TestSandboxDelete_AProjectWithHistoryIsDeleted(t *testing.T) {
	s, st, r, ws := sandboxSvc(t)
	p, raw := projectWithHistory(t, s, st, ws, "Loja teste", "m1")
	if _, err := s.IntrospectKey(bg, raw); err != nil {
		t.Fatalf("before deletion the key works: %v", err)
	}

	d, _, err := s.DeleteProject(bg, "u_owner", p.ID, "Loja teste", "", "")
	if err != nil {
		t.Fatalf("a project with keys, a binding and logs must be deletable in the Sandbox: %v", err)
	}
	if d.Status != StatusDeleting || d.KeysRevoked != 1 {
		t.Fatalf("deletion accepted: %+v", d)
	}
	if _, err := s.IntrospectKey(bg, raw); err == nil {
		t.Fatal("a key of a deleted project still authenticates")
	}
	if _, err := s.GetProject(bg, "u_owner", p.ID); err != ErrNotFound {
		t.Fatalf("a deleted project is gone from the Sandbox: %v", err)
	}
	list, _ := s.ListProjects(bg, "u_owner", ws, true)
	for _, x := range list {
		if x.ID == p.ID {
			t.Fatal("a deleted project is still listed")
		}
	}
	if got := r.passesFor(p.ID); len(got) != 1 || !got[0].retireBusiness {
		t.Fatalf("Core retires the project's own Business in the first pass: %+v", got)
	}

	finishAll(t, s)
	final, _ := st.Project(bg, p.ID)
	if final.Status != StatusDeleted || final.Name == "Loja teste" {
		t.Fatalf("after the grace the project is a tombstone: %+v", final)
	}
	if len(st.requestLogs) != 0 {
		t.Fatal("operational request logs go with the project")
	}
	audited := map[string]bool{}
	for _, a := range st.Audits {
		audited[a.Action] = true
	}
	if !audited["project.deletion_requested"] || !audited["project.deleted"] {
		t.Fatalf("both the request and the completion are audited: %v", audited)
	}

	// The same name makes a NEW project, with new authority.
	again, err := s.CreateProject(bg, "u_owner", ws, "Loja teste", "", "")
	if err != nil || again.ID == p.ID {
		t.Fatalf("name reuse must create a new resource: %v %+v", err, again)
	}
	if _, _, err := s.CreateAPIKey(bg, "u_owner", again.ID, KindSecret, "k", []string{"identity:read"}, "", ""); err != nil {
		t.Fatalf("the new project gets its own key: %v", err)
	}
	if _, err := s.IntrospectKey(bg, raw); err == nil {
		t.Fatal("reusing the name resurrected the old key")
	}
}

func TestSandboxDelete_AuthorityEndsBeforeCleanup(t *testing.T) {
	s, st, r, ws := sandboxSvc(t)
	r.down = true // Core is unreachable: cleanup cannot run
	p, raw := projectWithHistory(t, s, st, ws, "Sem core", "m1")
	d, _, err := s.DeleteProject(bg, "u_owner", p.ID, "Sem core", "", "")
	if err != nil || d.Status != StatusDeleting {
		t.Fatalf("deletion is accepted even while cleanup cannot run: %v %+v", err, d)
	}
	if _, err := s.IntrospectKey(bg, raw); err == nil {
		t.Fatal("authority waited for cleanup")
	}
	// Nothing new is created under a deleting project.
	if _, err := st.CreateAPIKey(bg, APIKeyInsert{ProjectID: p.ID, Environment: EnvSandbox, Kind: KindSecret, KeyHash: "h2"}); !errors.Is(err, ErrDeleting) {
		t.Fatalf("store must refuse a key under a deleting project: %v", err)
	}
	if _, err := st.CreateBinding(bg, BindingInsert{ProjectID: p.ID, MerchantID: "m9"}); !errors.Is(err, ErrDeleting) {
		t.Fatalf("store must refuse a binding under a deleting project: %v", err)
	}
	if _, _, err := s.CreateAPIKey(bg, "u_owner", p.ID, KindSecret, "k", []string{"identity:read"}, "", ""); err == nil {
		t.Fatal("the Console created a key under a deleting project")
	}

	// Core comes back: the resumer finishes it, with no operator.
	r.down = false
	finishAll(t, s)
	final, _ := st.Project(bg, p.ID)
	if final.Status != StatusDeleted || len(r.passesFor(p.ID)) == 0 {
		t.Fatalf("recovery: %+v passes=%d", final, len(r.passesFor(p.ID)))
	}
}

func TestSandboxDelete_RepeatingTheRequestIsSafe(t *testing.T) {
	s, st, _, ws := sandboxSvc(t)
	p, _ := projectWithHistory(t, s, st, ws, "Duas vezes", "m1")
	if _, _, err := s.DeleteProject(bg, "u_owner", p.ID, "Duas vezes", "", ""); err != nil {
		t.Fatal(err)
	}
	d, _, err := s.DeleteProject(bg, "u_owner", p.ID, "", "", "")
	if err != nil || d.Status != StatusDeleting || d.KeysRevoked != 0 {
		t.Fatalf("a retry answers the state and revokes nothing twice: %v %+v", err, d)
	}
	finishAll(t, s)
	d, _, err = s.DeleteProject(bg, "u_owner", p.ID, "", "", "")
	if err != nil || d.Status != StatusDeleted {
		t.Fatalf("a retry after completion: %v %+v", err, d)
	}
}

func TestSandboxDelete_ASharedBusinessIsNotRetired(t *testing.T) {
	s, st, r, ws := sandboxSvc(t)
	owner, _ := projectWithHistory(t, s, st, ws, "Dono", "shared")
	other, otherKey := projectWithHistory(t, s, st, ws, "Ligado", "shared")
	if _, _, err := s.DeleteProject(bg, "u_owner", owner.ID, "Dono", "", ""); err != nil {
		t.Fatal(err)
	}
	if got := r.passesFor(owner.ID); len(got) != 1 || got[0].retireBusiness {
		t.Fatalf("a Business another live project uses is not retired: %+v", got)
	}
	if _, err := s.IntrospectKey(bg, otherKey); err != nil {
		t.Fatalf("the other project keeps its authority: %v", err)
	}
	if _, err := s.GetProject(bg, "u_owner", other.ID); err != nil {
		t.Fatalf("the other project is untouched: %v", err)
	}

	// The last project on it goes: Core is asked to retire it, and told which one.
	if _, _, err := s.DeleteProject(bg, "u_owner", other.ID, "Ligado", "", ""); err != nil {
		t.Fatal(err)
	}
	if got := r.passesFor(other.ID); len(got) != 1 || !got[0].retireBusiness || got[0].bound != "shared" {
		t.Fatalf("the last project on a shared Business names it for retirement: %+v", got)
	}
}

func TestSandboxDelete_DeletionIsForManagersAndOwnersOnly(t *testing.T) {
	s, st, _, ws := sandboxSvc(t)
	p, _ := projectWithHistory(t, s, st, ws, "Protegido", "m1")
	if _, _, err := s.DeleteProject(bg, "u_dev", p.ID, "Protegido", "", ""); err != ErrForbidden {
		t.Fatalf("a DEVELOPER cannot delete a project: %v", err)
	}
	if _, _, err := s.DeleteProject(bg, "u_outsider", p.ID, "Protegido", "", ""); err != ErrNotFound {
		t.Fatalf("an outsider cannot see it to delete it: %v", err)
	}
	if _, _, err := s.DeleteWorkspace(bg, "u_dev", ws, "WS", "", ""); err != ErrForbidden {
		t.Fatalf("only the OWNER deletes a workspace: %v", err)
	}
	if _, _, err := s.DeleteProject(bg, "u_owner", p.ID, "outro", "", ""); err != ErrValidation {
		t.Fatalf("the name must be typed: %v", err)
	}
}

func TestSandboxDelete_WorkspaceCascadesWithoutArchivingFirst(t *testing.T) {
	s, st, r, ws := sandboxSvc(t)
	a, keyA := projectWithHistory(t, s, st, ws, "A ativo", "mA")
	b, keyB := projectWithHistory(t, s, st, ws, "B arquivado", "mB")
	c, keyC := projectWithHistory(t, s, st, ws, "C ativo", "mC")
	if _, err := s.ArchiveProject(bg, "u_owner", b.ID, "B arquivado", "", ""); err != nil {
		t.Fatal(err)
	}
	_, pendingRaw, err := s.InviteMember(bg, "u_owner", ws, "later@x.co", RoleDeveloper, "", "")
	if err != nil {
		t.Fatal(err)
	}

	d, _, err := s.DeleteWorkspace(bg, "u_owner", ws, "WS", "", "")
	if err != nil || d.Status != StatusDeleting {
		t.Fatalf("a workspace with active and archived projects is deleted in one request: %v %+v", err, d)
	}
	for name, raw := range map[string]string{"A": keyA, "B": keyB, "C": keyC} {
		if _, err := s.IntrospectKey(bg, raw); err == nil {
			t.Fatalf("project %s's key still authenticates", name)
		}
	}
	if _, err := s.GetWorkspace(bg, "u_dev", ws); err == nil {
		t.Fatal("a member keeps access to a deleted workspace")
	}
	if list, _ := s.ListWorkspaces(bg, "u_owner"); len(list) != 0 {
		t.Fatalf("the deleted workspace is still listed: %+v", list)
	}
	if _, err := s.AcceptInvite(bg, "u_later", "later@x.co", pendingRaw, "", ""); err == nil {
		t.Fatal("a pending invite to a deleted workspace was accepted")
	}
	for _, p := range []*Project{a, b, c} {
		if len(r.passesFor(p.ID)) == 0 {
			t.Fatalf("project %s was not retired", p.Name)
		}
	}

	finishAll(t, s)
	w, _ := st.Workspace(bg, ws)
	if w.Status != StatusDeleted {
		t.Fatalf("workspace after the grace: %+v", w)
	}
	for _, p := range []*Project{a, b, c} {
		got, _ := st.Project(bg, p.ID)
		if got.Status != StatusDeleted {
			t.Fatalf("project %s: %s", p.Name, got.Status)
		}
	}
	if m, _ := st.MembershipAnyState(bg, ws, "u_dev"); m != nil {
		t.Fatal("memberships of a deleted workspace are removed")
	}
	// The owner can create a workspace with the same name again: a new one.
	again, err := s.CreateWorkspace(bg, "u_owner", "WS", "", "")
	if err != nil || again.ID == ws {
		t.Fatalf("workspace name reuse: %v %+v", err, again)
	}
}

func TestSandboxDelete_AnotherWorkspaceIsUntouched(t *testing.T) {
	s, st, _, wsA := sandboxSvc(t)
	projectWithHistory(t, s, st, wsA, "Igual", "mA")
	wsB, err := s.CreateWorkspace(bg, "u_other", "WS", "", "") // same display name, different owner
	if err != nil {
		t.Fatal(err)
	}
	pB, err := s.CreateProject(bg, "u_other", wsB.ID, "Igual", "", "")
	if err != nil {
		t.Fatal(err)
	}
	_, rawB, err := s.CreateAPIKey(bg, "u_other", pB.ID, KindSecret, "k", []string{"identity:read"}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.DeleteWorkspace(bg, "u_other", wsA, "WS", "", ""); err != ErrForbidden {
		t.Fatalf("another owner cannot delete this workspace by id: %v", err)
	}
	if _, _, err := s.DeleteWorkspace(bg, "u_owner", wsA, "WS", "", ""); err != nil {
		t.Fatal(err)
	}
	finishAll(t, s)
	if _, err := s.IntrospectKey(bg, rawB); err != nil {
		t.Fatalf("workspace B's key: %v", err)
	}
	if _, err := s.GetProject(bg, "u_other", pB.ID); err != nil {
		t.Fatalf("workspace B's project: %v", err)
	}
	if w, _ := st.Workspace(bg, wsB.ID); w.Status != StatusActive {
		t.Fatalf("workspace B: %+v", w)
	}
}

func TestSandboxDelete_AnArchivedProjectCanBeDeleted(t *testing.T) {
	s, st, _, ws := sandboxSvc(t)
	p, _ := projectWithHistory(t, s, st, ws, "Arquivado", "m1")
	if _, err := s.ArchiveProject(bg, "u_owner", p.ID, "Arquivado", "", ""); err != nil {
		t.Fatal(err)
	}
	if d, _, err := s.DeleteProject(bg, "u_owner", p.ID, "Arquivado", "", ""); err != nil || d.Status != StatusDeleting {
		t.Fatalf("archived project delete: %v %+v", err, d)
	}
}

func TestSandboxDelete_ArchiveStaysArchive(t *testing.T) {
	s, st, r, ws := sandboxSvc(t)
	p, _ := projectWithHistory(t, s, st, ws, "Só arquivar", "m1")
	if _, err := s.ArchiveProject(bg, "u_owner", p.ID, "Só arquivar", "", ""); err != nil {
		t.Fatal(err)
	}
	got, _ := st.Project(bg, p.ID)
	if got.Status != StatusArchived || len(r.passesFor(p.ID)) != 0 {
		t.Fatalf("archive retires authority and nothing else: %+v passes=%d", got, len(r.passesFor(p.ID)))
	}
	if list, _ := s.ListProjects(bg, "u_owner", ws, true); len(list) != 1 {
		t.Fatalf("an archived project is still listed when asked for: %d", len(list))
	}
}
