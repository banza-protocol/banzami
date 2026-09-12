// Workspace and project lifecycle: rename, leave, archive, delete.
//
// A developer could create a workspace and a project and then never end either
// one. There was no rename, no way to leave, and no owner-reachable close: the
// only project retirement lived behind operator authority on an internal route.
// Everything a developer had ever made stayed in the switcher for ever, and a
// project created by a typo was permanent.
//
// These tests hold the rules that make ending things safe: nothing cascades
// silently, a refusal names what is in the way, the last owner cannot leave, a
// rename never moves the Project ID, and an archived project keeps no authority.
package developer

import "testing"

func TestWorkspace_RenameKeepsTheSlug(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	before, _ := s.GetWorkspace(bg, "u_owner", ws)

	after, err := s.RenameWorkspace(bg, "u_owner", ws, "Nome Novo", "", "")
	if err != nil {
		t.Fatalf("owner rename: %v", err)
	}
	if after.Name != "Nome Novo" {
		t.Errorf("name = %q, want %q", after.Name, "Nome Novo")
	}
	// The slug is the stable identity. A rename that moved it would break every
	// reference anyone had written down.
	if after.Slug != before.Slug {
		t.Errorf("slug moved on rename: %q → %q", before.Slug, after.Slug)
	}
}

func TestWorkspace_RenameIsForManagersOnly(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	for _, actor := range []string{"u_dev", "u_view", "u_outsider"} {
		if _, err := s.RenameWorkspace(bg, actor, ws, "Roubado", "", ""); err != ErrForbidden {
			t.Errorf("%s rename: want Forbidden, got %v", actor, err)
		}
	}
	got, _ := s.GetWorkspace(bg, "u_owner", ws)
	if got.Name == "Roubado" {
		t.Error("a refused rename changed the name anyway")
	}
}

func TestWorkspace_RenameRejectsEmptyAndOverlongNames(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	long := ""
	for i := 0; i < 81; i++ {
		long += "x"
	}
	for _, name := range []string{"", "   ", long} {
		if _, err := s.RenameWorkspace(bg, "u_owner", ws, name, "", ""); err != ErrValidation {
			t.Errorf("rename to %q: want Validation, got %v", name, err)
		}
	}
}

func TestWorkspace_ArchiveNeedsTheNameTyped(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	if _, err := s.ArchiveWorkspace(bg, "u_owner", ws, "not the name", "", ""); err != ErrValidation {
		t.Fatalf("archive with wrong confirmation: want Validation, got %v", err)
	}
	got, _ := s.GetWorkspace(bg, "u_owner", ws)
	if got.Status != "ACTIVE" {
		t.Fatalf("a refused archive changed the status to %q", got.Status)
	}
	if _, err := s.ArchiveWorkspace(bg, "u_owner", ws, got.Name, "", ""); err != nil {
		t.Fatalf("archive with the right name: %v", err)
	}
	got, _ = s.GetWorkspace(bg, "u_owner", ws)
	if got.Status != "ARCHIVED" {
		t.Errorf("status = %q, want ARCHIVED", got.Status)
	}
}

func TestWorkspace_ArchiveIsOwnerOnly(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	addMember(t, s, "u_owner", ws, "admin@x.co", RoleAdmin, "u_admin")
	name, _ := s.GetWorkspace(bg, "u_owner", ws)
	// An ADMIN manages the workspace; closing it is the owner's decision.
	for _, actor := range []string{"u_admin", "u_dev", "u_view", "u_outsider"} {
		if _, err := s.ArchiveWorkspace(bg, actor, ws, name.Name, "", ""); err != ErrForbidden {
			t.Errorf("%s archive: want Forbidden, got %v", actor, err)
		}
	}
}

func TestWorkspace_ArchiveIsBlockedByActiveProjectsAndSaysHowMany(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	name, _ := s.GetWorkspace(bg, "u_owner", ws)
	if _, err := s.CreateProject(bg, "u_owner", ws, "Um", "", ""); err != nil {
		t.Fatal(err)
	}
	p2, err := s.CreateProject(bg, "u_owner", ws, "Dois", "", "")
	if err != nil {
		t.Fatal(err)
	}

	blockers, err := s.ArchiveWorkspace(bg, "u_owner", ws, name.Name, "", "")
	if err != ErrConflict {
		t.Fatalf("archive with active projects: want Conflict, got %v", err)
	}
	if blockers.ActiveProjects != 2 {
		t.Errorf("blockers.ActiveProjects = %d, want 2", blockers.ActiveProjects)
	}
	// Nothing cascaded: the projects are untouched.
	got, _ := s.GetProject(bg, "u_owner", p2.ID)
	if got.Status != "ACTIVE" {
		t.Errorf("a refused workspace archive changed project status to %q", got.Status)
	}
	still, _ := s.GetWorkspace(bg, "u_owner", ws)
	if still.Status != "ACTIVE" {
		t.Errorf("a refused workspace archive changed the workspace status to %q", still.Status)
	}
}

func TestWorkspace_LastOwnerCannotLeave(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	if err := s.LeaveWorkspace(bg, "u_owner", ws, "", ""); err != ErrLastOwner {
		t.Fatalf("last owner leaving: want ErrLastOwner, got %v", err)
	}
	if _, err := s.GetWorkspace(bg, "u_owner", ws); err != nil {
		t.Errorf("owner lost access after a refused leave: %v", err)
	}
}

func TestWorkspace_AMemberCanLeaveWithoutBeingAManager(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	// A VIEWER may not remove anybody — but may remove themselves.
	if err := s.LeaveWorkspace(bg, "u_view", ws, "", ""); err != nil {
		t.Fatalf("viewer leaving own workspace: %v", err)
	}
	if _, err := s.GetWorkspace(bg, "u_view", ws); err != ErrForbidden {
		t.Errorf("after leaving, want Forbidden, got %v", err)
	}
	// Leaving is not removing: everybody else is still in.
	if _, err := s.GetWorkspace(bg, "u_dev", ws); err != nil {
		t.Errorf("another member lost access when one left: %v", err)
	}
}

func TestWorkspace_AnOwnerCanLeaveOnceAnotherOwnerExists(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	addMember(t, s, "u_owner", ws, "second@x.co", RoleOwner, "u_owner2")
	if err := s.LeaveWorkspace(bg, "u_owner", ws, "", ""); err != nil {
		t.Fatalf("owner leaving with a co-owner present: %v", err)
	}
	if _, err := s.GetWorkspace(bg, "u_owner2", ws); err != nil {
		t.Errorf("remaining owner lost access: %v", err)
	}
}

// ── projects ─────────────────────────────────────────────────────────────────

func TestProject_RenameKeepsTheProjectID(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	p, err := s.CreateProject(bg, "u_owner", ws, "Antigo", "", "")
	if err != nil {
		t.Fatal(err)
	}
	after, err := s.RenameProject(bg, "u_dev", p.ID, "Novo", "", "")
	if err != nil {
		t.Fatalf("developer rename: %v", err)
	}
	if after.Name != "Novo" {
		t.Errorf("name = %q, want Novo", after.Name)
	}
	// This is the whole point of the rename contract: a developer has this value
	// in a config file and a deployed container.
	if after.ID != p.ID || after.Slug != p.Slug {
		t.Errorf("Project ID moved on rename: id %q→%q slug %q→%q", p.ID, after.ID, p.Slug, after.Slug)
	}
}

func TestProject_RenameRefusedForViewersAndOutsiders(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	p, _ := s.CreateProject(bg, "u_owner", ws, "Projecto", "", "")
	if _, err := s.RenameProject(bg, "u_view", p.ID, "Roubado", "", ""); err != ErrForbidden {
		t.Errorf("viewer rename: want Forbidden, got %v", err)
	}
	// An outsider gets not-found, not forbidden: 403 for a project that exists
	// and 404 for one that does not is an id oracle.
	if _, err := s.RenameProject(bg, "u_outsider", p.ID, "Roubado", "", ""); err != ErrNotFound {
		t.Errorf("outsider rename: want NotFound, got %v", err)
	}
}

func TestProject_AnEmptyProjectCanBeDeleted(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	p, _ := s.CreateProject(bg, "u_owner", ws, "Engano", "", "")

	f, err := s.ProjectFootprintFor(bg, "u_owner", p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !f.Empty() {
		t.Fatalf("a project with nothing in it reported footprint %+v", f)
	}
	if _, err := s.DeleteProject(bg, "u_owner", p.ID, "Engano", "", ""); err != nil {
		t.Fatalf("delete empty project: %v", err)
	}
	if _, err := s.GetProject(bg, "u_owner", p.ID); err != ErrNotFound {
		t.Errorf("after delete, want NotFound, got %v", err)
	}
}

func TestProject_DeleteNeedsTheNameTyped(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	p, _ := s.CreateProject(bg, "u_owner", ws, "Engano", "", "")
	if _, err := s.DeleteProject(bg, "u_owner", p.ID, "outro nome", "", ""); err != ErrValidation {
		t.Fatalf("delete with wrong confirmation: want Validation, got %v", err)
	}
	if _, err := s.GetProject(bg, "u_owner", p.ID); err != nil {
		t.Errorf("a refused delete removed the project anyway: %v", err)
	}
}

func TestProject_AProjectThatIssuedAKeyIsArchivedNotDeleted(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	p, _ := s.CreateProject(bg, "u_owner", ws, "Real", "", "")
	if _, _, err := s.CreateAPIKey(bg, "u_owner", p.ID, KindSecret, "k", []string{"identity:read"}, "", ""); err != nil {
		t.Fatal(err)
	}

	f, err := s.DeleteProject(bg, "u_owner", p.ID, "Real", "", "")
	if err != ErrConflict {
		t.Fatalf("delete a project that has issued a key: want Conflict, got %v", err)
	}
	if f.Keys != 1 {
		t.Errorf("footprint.Keys = %d, want 1", f.Keys)
	}
	if len(f.Blockers()) == 0 || f.Blockers()[0] != "API_KEYS" {
		t.Errorf("blockers = %v, want API_KEYS named", f.Blockers())
	}
	if _, err := s.GetProject(bg, "u_owner", p.ID); err != nil {
		t.Errorf("a refused delete removed the project anyway: %v", err)
	}
}

// A revoked key still counts. The project issued a credential that once
// authorised requests; that is history, and history is archived.
func TestProject_ARevokedKeyStillBlocksDeletion(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	p, _ := s.CreateProject(bg, "u_owner", ws, "Real", "", "")
	k, _, err := s.CreateAPIKey(bg, "u_owner", p.ID, KindSecret, "k", []string{"identity:read"}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.RevokeAPIKey(bg, "u_owner", k.ID, "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DeleteProject(bg, "u_owner", p.ID, "Real", "", ""); err != ErrConflict {
		t.Fatalf("delete after revoking the key: want Conflict, got %v", err)
	}
}

func TestProject_DeleteIsForManagersOnly(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	p, _ := s.CreateProject(bg, "u_dev", ws, "Meu", "", "")
	// A DEVELOPER may create a project and may not delete one.
	if _, err := s.DeleteProject(bg, "u_dev", p.ID, "Meu", "", ""); err != ErrForbidden {
		t.Errorf("developer delete: want Forbidden, got %v", err)
	}
}

func TestProject_ArchivingRevokesEveryActiveKey(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	p, _ := s.CreateProject(bg, "u_owner", ws, "Real", "", "")
	for _, n := range []string{"a", "b"} {
		if _, _, err := s.CreateAPIKey(bg, "u_owner", p.ID, KindSecret, n, []string{"identity:read"}, "", ""); err != nil {
			t.Fatal(err)
		}
	}

	revoked, err := s.ArchiveProject(bg, "u_owner", p.ID, "Real", "", "")
	if err != nil {
		t.Fatalf("archive: %v", err)
	}
	if revoked != 2 {
		t.Errorf("keys revoked = %d, want 2", revoked)
	}
	keys, err := s.ListAPIKeys(bg, "u_owner", p.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, k := range keys {
		if k.Status == "ACTIVE" {
			// An archived project holding a live credential is authority
			// pointing at something nothing is watching any more.
			t.Errorf("key %s is still ACTIVE after the project was archived", k.ID)
		}
	}
}

func TestProject_ArchivedProjectsAreHiddenUnlessAskedFor(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	live, _ := s.CreateProject(bg, "u_owner", ws, "Viva", "", "")
	gone, _ := s.CreateProject(bg, "u_owner", ws, "Arquivada", "", "")
	if _, err := s.ArchiveProject(bg, "u_owner", gone.ID, "Arquivada", "", ""); err != nil {
		t.Fatal(err)
	}

	def, err := s.ListProjects(bg, "u_owner", ws, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(def) != 1 || def[0].ID != live.ID {
		t.Errorf("default list = %d projects, want only the active one", len(def))
	}

	all, err := s.ListProjects(bg, "u_owner", ws, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Errorf("list with archived = %d projects, want 2", len(all))
	}
}

func TestProject_ArchiveIsIdempotent(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	p, _ := s.CreateProject(bg, "u_owner", ws, "Duas", "", "")
	if _, err := s.ArchiveProject(bg, "u_owner", p.ID, "Duas", "", ""); err != nil {
		t.Fatal(err)
	}
	// Asking again for a state it is already in converges rather than failing:
	// a retry must not look like an error.
	if _, err := s.ArchiveProject(bg, "u_owner", p.ID, "Duas", "", ""); err != nil {
		t.Fatalf("second archive: %v", err)
	}
}

func TestProject_ArchivingOneWorkspaceProjectUnblocksClosingTheWorkspace(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	name, _ := s.GetWorkspace(bg, "u_owner", ws)
	p, _ := s.CreateProject(bg, "u_owner", ws, "Única", "", "")
	if _, err := s.ArchiveWorkspace(bg, "u_owner", ws, name.Name, "", ""); err != ErrConflict {
		t.Fatal("expected the active project to block closing the workspace")
	}
	if _, err := s.ArchiveProject(bg, "u_owner", p.ID, "Única", "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ArchiveWorkspace(bg, "u_owner", ws, name.Name, "", ""); err != nil {
		t.Fatalf("archive workspace after archiving its only project: %v", err)
	}
}

// Every lifecycle action leaves a record. Nothing here is a silent state change.
func TestLifecycle_EveryActionIsAudited(t *testing.T) {
	s, st, ws := wsWithRoles(t)
	p, _ := s.CreateProject(bg, "u_owner", ws, "Auditada", "", "")

	if _, err := s.RenameProject(bg, "u_owner", p.ID, "Renomeada", "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ArchiveProject(bg, "u_owner", p.ID, "Renomeada", "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.RenameWorkspace(bg, "u_owner", ws, "WS Renomeado", "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ArchiveWorkspace(bg, "u_owner", ws, "WS Renomeado", "", ""); err != nil {
		t.Fatal(err)
	}

	want := map[string]bool{
		"project.renamed":    false,
		"project.archived":   false,
		"workspace.renamed":  false,
		"workspace.archived": false,
	}
	for _, ev := range st.Audits {
		if _, ok := want[ev.Action]; ok {
			want[ev.Action] = true
		}
	}
	for action, seen := range want {
		if !seen {
			t.Errorf("no audit event for %s", action)
		}
	}
}

func TestLifecycle_SlugStaysStableAcrossRepeatedRenames(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	p, _ := s.CreateProject(bg, "u_owner", ws, "Zero", "", "")
	slug := p.Slug
	for i, n := range []string{"Um", "Dois", "Três"} {
		out, err := s.RenameProject(bg, "u_owner", p.ID, n, "", "")
		if err != nil {
			t.Fatalf("rename %d: %v", i, err)
		}
		if out.Slug != slug {
			t.Fatalf("slug moved on rename %d: %q → %q", i, slug, out.Slug)
		}
	}
}

// ── workspace deletion ───────────────────────────────────────────────────────
//
// A workspace used to have only one ending: ARCHIVED, with the Console
// asserting it "can never be deleted" because the audit log is append-only.
// That reason does not hold. developer.audit_events has no foreign key to a
// workspace, so the record of a deletion outlives the row it describes — which
// is what an append-only log owes. What it does not owe is an empty workspace
// staying in somebody's selector for ever because it was created by mistake.
//
// So the rule is the one projects already follow, one level up: never held a
// project → delete; held one → archive.

func TestWorkspace_EmptyIsDeletedOutright(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	name, _ := s.GetWorkspace(bg, "u_owner", ws)

	f, err := s.DeleteWorkspace(bg, "u_owner", ws, name.Name, "", "")
	if err != nil {
		t.Fatalf("delete an empty workspace: %v", err)
	}
	if !f.Empty() {
		t.Errorf("footprint reported not empty: %+v", f)
	}
	// Gone, not marked: it must not come back as an ARCHIVED row.
	if _, err := s.GetWorkspace(bg, "u_owner", ws); err == nil {
		t.Fatal("the workspace is still readable after being deleted")
	}
	listed, err := s.ListWorkspaces(bg, "u_owner")
	if err != nil {
		t.Fatal(err)
	}
	for _, w := range listed {
		if w.ID == ws {
			t.Fatal("the deleted workspace is still listed for its owner")
		}
	}
}

func TestWorkspace_DeleteNeedsTheNameTyped(t *testing.T) {
	s, _, ws := wsWithRoles(t)

	if _, err := s.DeleteWorkspace(bg, "u_owner", ws, "não é o nome", "", ""); err != ErrValidation {
		t.Fatalf("delete with the wrong name: want Validation, got %v", err)
	}
	if _, err := s.GetWorkspace(bg, "u_owner", ws); err != nil {
		t.Fatal("a refused delete removed the workspace anyway")
	}
}

func TestWorkspace_DeleteIsOwnerOnly(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	name, _ := s.GetWorkspace(bg, "u_owner", ws)

	for _, who := range []string{"u_admin", "u_dev", "u_viewer"} {
		if _, err := s.DeleteWorkspace(bg, who, ws, name.Name, "", ""); err != ErrForbidden {
			t.Errorf("%s deleting a workspace: want Forbidden, got %v", who, err)
		}
	}
	if _, err := s.GetWorkspace(bg, "u_owner", ws); err != nil {
		t.Fatal("a refused delete removed the workspace anyway")
	}
}

func TestWorkspace_DeleteIsRefusedWhileItHoldsAnActiveProject(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	name, _ := s.GetWorkspace(bg, "u_owner", ws)
	p, err := s.CreateProject(bg, "u_owner", ws, "Um", "", "")
	if err != nil {
		t.Fatal(err)
	}

	f, err := s.DeleteWorkspace(bg, "u_owner", ws, name.Name, "", "")
	if err != ErrConflict {
		t.Fatalf("delete with an active project: want Conflict, got %v", err)
	}
	if f.ActiveProjects != 1 || f.Projects != 1 {
		t.Errorf("footprint = %+v, want 1 project, 1 active", f)
	}
	if want := []string{"ACTIVE_PROJECTS"}; len(f.Blockers()) != 1 || f.Blockers()[0] != want[0] {
		t.Errorf("blockers = %v, want %v", f.Blockers(), want)
	}
	// Nothing cascaded: the project and the workspace are both untouched.
	got, _ := s.GetProject(bg, "u_owner", p.ID)
	if got.Status != "ACTIVE" {
		t.Errorf("a refused workspace delete changed project status to %q", got.Status)
	}
	if _, err := s.GetWorkspace(bg, "u_owner", ws); err != nil {
		t.Fatal("a refused delete removed the workspace anyway")
	}
}

// The case the "append-only" argument was really about: a workspace whose
// project was ARCHIVED because it had a history. That history must survive, so
// the workspace is archived rather than deleted — and the refusal says which
// kind of project is in the way, because "archive the active ones first" would
// be wrong advice here.
func TestWorkspace_HoldingAnArchivedProjectIsArchivedNotDeleted(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	name, _ := s.GetWorkspace(bg, "u_owner", ws)
	p, err := s.CreateProject(bg, "u_owner", ws, "Com história", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ArchiveProject(bg, "u_owner", p.ID, p.Name, "", ""); err != nil {
		t.Fatal(err)
	}

	f, err := s.DeleteWorkspace(bg, "u_owner", ws, name.Name, "", "")
	if err != ErrConflict {
		t.Fatalf("delete over an archived project: want Conflict, got %v", err)
	}
	if f.ArchivedProjects != 1 || f.ActiveProjects != 0 {
		t.Errorf("footprint = %+v, want 1 archived, 0 active", f)
	}
	if len(f.Blockers()) != 1 || f.Blockers()[0] != "ARCHIVED_PROJECTS" {
		t.Errorf("blockers = %v, want [ARCHIVED_PROJECTS]", f.Blockers())
	}
	// Archiving is what it CAN do, and it works: no active project blocks it.
	if _, err := s.ArchiveWorkspace(bg, "u_owner", ws, name.Name, "", ""); err != nil {
		t.Fatalf("archive a workspace holding only archived projects: %v", err)
	}
	after, err := s.GetWorkspace(bg, "u_owner", ws)
	if err != nil {
		t.Fatal("archiving removed the workspace")
	}
	if after.Status != "ARCHIVED" {
		t.Errorf("status = %q, want ARCHIVED", after.Status)
	}
}

// Deleting an empty project leaves the workspace empty again, and therefore
// deletable. The two rules compose: a developer who made two mistakes can undo
// both.
func TestWorkspace_BecomesDeletableAgainOnceItsEmptyProjectIsDeleted(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	name, _ := s.GetWorkspace(bg, "u_owner", ws)
	p, err := s.CreateProject(bg, "u_owner", ws, "Engano", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DeleteProject(bg, "u_owner", p.ID, p.Name, "", ""); err != nil {
		t.Fatalf("delete an empty project: %v", err)
	}
	if _, err := s.DeleteWorkspace(bg, "u_owner", ws, name.Name, "", ""); err != nil {
		t.Fatalf("delete the workspace once its only project is gone: %v", err)
	}
	if _, err := s.GetWorkspace(bg, "u_owner", ws); err == nil {
		t.Fatal("the workspace survived its own deletion")
	}
}
