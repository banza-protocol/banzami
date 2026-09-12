// The lifecycle SQL, against a real migrated database.
//
// The in-memory store and the Postgres store are two implementations of one
// port, and the one that runs in production is the SQL. A rename that keeps the
// slug in Go and rewrites it in SQL, or a delete whose WHERE clause disagrees
// with the service's footprint check, would pass every test in lifecycle_test.go
// and fail the first developer who used it. These run the same rules through the
// statements themselves.
package developer

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/banzami/banzami/services/common/env"
)

func pgLifecycleSvc(ctx context.Context, t *testing.T) (*Service, string) {
	t.Helper()
	pool := devPoolOrSkip(ctx, t)
	t.Cleanup(pool.Close)
	// The workspace status CHECK must already allow ARCHIVED (migration 0139).
	// Without it the archive statement fails at the constraint, and a skip here
	// would hide exactly the drift this file exists to catch — so it fails.
	var def string
	if err := pool.QueryRow(ctx,
		`SELECT pg_get_constraintdef(oid) FROM pg_constraint
		  WHERE conname = 'dev_workspaces_status_check'`).Scan(&def); err != nil {
		t.Fatalf("dev_workspaces_status_check is missing — migration 0139 not applied: %v", err)
	}
	svc := NewService(NewPGStore(pool, env.Sandbox), "invite-secret-fixture", "api-key-pepper-fixture", time.Hour)
	return svc, uuid.NewString()
}

func TestPgStore_RenameKeepsSlugAndArchiveHidesTheProject(t *testing.T) {
	ctx := context.Background()
	svc, actor := pgLifecycleSvc(ctx, t)

	ws, err := svc.CreateWorkspace(ctx, actor, "PG Lifecycle "+uuid.NewString()[:8], "", "")
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	p, err := svc.CreateProject(ctx, actor, ws.ID, "Antes", "", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}

	renamed, err := svc.RenameProject(ctx, actor, p.ID, "Depois", "", "")
	if err != nil {
		t.Fatalf("rename project: %v", err)
	}
	if renamed.Name != "Depois" {
		t.Errorf("name = %q, want Depois", renamed.Name)
	}
	if renamed.Slug != p.Slug || renamed.ID != p.ID {
		t.Fatalf("Project ID moved in SQL: id %q→%q slug %q→%q", p.ID, renamed.ID, p.Slug, renamed.Slug)
	}

	if _, err := svc.ArchiveProject(ctx, actor, p.ID, "Depois", "", ""); err != nil {
		t.Fatalf("archive project: %v", err)
	}
	def, err := svc.ListProjects(ctx, actor, ws.ID, false)
	if err != nil {
		t.Fatal(err)
	}
	for _, got := range def {
		if got.ID == p.ID {
			t.Error("an archived project is still in the default list")
		}
	}
	all, err := svc.ListProjects(ctx, actor, ws.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, got := range all {
		if got.ID == p.ID {
			found = true
		}
	}
	if !found {
		t.Error("an archived project is missing even when archived ones are asked for")
	}

	// The workspace has nothing active left, so it can be closed.
	wsName := ws.Name
	if _, err := svc.ArchiveWorkspace(ctx, actor, ws.ID, wsName, "", ""); err != nil {
		t.Fatalf("archive workspace in SQL: %v", err)
	}
	got, err := svc.GetWorkspace(ctx, actor, ws.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "ARCHIVED" {
		t.Errorf("workspace status = %q, want ARCHIVED", got.Status)
	}
}

func TestPgStore_DeleteRefusesAProjectThatHasIssuedAKey(t *testing.T) {
	ctx := context.Background()
	svc, actor := pgLifecycleSvc(ctx, t)

	ws, err := svc.CreateWorkspace(ctx, actor, "PG Delete "+uuid.NewString()[:8], "", "")
	if err != nil {
		t.Fatal(err)
	}

	// An empty project really is deletable in SQL.
	empty, err := svc.CreateProject(ctx, actor, ws.ID, "Vazio", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.DeleteProject(ctx, actor, empty.ID, "Vazio", "", ""); err != nil {
		t.Fatalf("delete an empty project: %v", err)
	}
	if _, err := svc.GetProject(ctx, actor, empty.ID); err != ErrNotFound {
		t.Errorf("after delete, want NotFound, got %v", err)
	}

	// One that issued a key is refused — by the statement's own NOT EXISTS, not
	// only by the service's check.
	withKey, err := svc.CreateProject(ctx, actor, ws.ID, "Com chave", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.CreateAPIKey(ctx, actor, withKey.ID, KindSecret, "k", []string{"identity:read"}, "", ""); err != nil {
		t.Fatal(err)
	}
	if err := svc.store.DeleteProject(ctx, withKey.ID); err != ErrConflict {
		t.Fatalf("SQL delete of a project holding a key: want Conflict, got %v", err)
	}
	if _, err := svc.GetProject(ctx, actor, withKey.ID); err != nil {
		t.Errorf("the refused delete removed the project anyway: %v", err)
	}

	// Close the workspace's remaining project, then the workspace, so the test
	// leaves nothing active behind it.
	if _, err := svc.ArchiveProject(ctx, actor, withKey.ID, "Com chave", "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ArchiveWorkspace(ctx, actor, ws.ID, ws.Name, "", ""); err != nil {
		t.Fatal(err)
	}
}

func TestPgStore_ClosingAWorkspaceIsBlockedByItsActiveProjects(t *testing.T) {
	ctx := context.Background()
	svc, actor := pgLifecycleSvc(ctx, t)

	ws, err := svc.CreateWorkspace(ctx, actor, "PG Blockers "+uuid.NewString()[:8], "", "")
	if err != nil {
		t.Fatal(err)
	}
	p, err := svc.CreateProject(ctx, actor, ws.ID, "Activo", "", "")
	if err != nil {
		t.Fatal(err)
	}

	blockers, err := svc.ArchiveWorkspace(ctx, actor, ws.ID, ws.Name, "", "")
	if err != ErrConflict {
		t.Fatalf("close with an active project: want Conflict, got %v", err)
	}
	if blockers.ActiveProjects != 1 {
		t.Errorf("ActiveProjects = %d, want 1", blockers.ActiveProjects)
	}
	// Nothing cascaded.
	got, err := svc.GetProject(ctx, actor, p.ID)
	if err != nil || got.Status != "ACTIVE" {
		t.Errorf("the refused close touched the project: status=%q err=%v", got.Status, err)
	}

	if _, err := svc.ArchiveProject(ctx, actor, p.ID, "Activo", "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ArchiveWorkspace(ctx, actor, ws.ID, ws.Name, "", ""); err != nil {
		t.Fatalf("close after archiving the project: %v", err)
	}
}

// Members read across the schema boundary, and a member whose identity row is
// missing is still listed.
//
// The Console rendered teammates as truncated UUIDs because name and email were
// never selected. They live in account_identity.identity_users — a different
// schema this context otherwise references by opaque id only — so the join is
// the one place that boundary is crossed, and it is crossed read-only, for two
// display columns of a member's own row.
func TestPgStore_MembersCarryNameAndEmail(t *testing.T) {
	ctx := context.Background()
	svc, actor := pgLifecycleSvc(ctx, t)

	pool := svc.store.(*pgStore).pool
	email := "member-" + uuid.NewString()[:8] + "@example.test"
	if _, err := pool.Exec(ctx,
		`INSERT INTO account_identity.identity_users (id, email, name, verified)
		 VALUES ($1, $2, 'Ana Cruz', true)`, actor, email); err != nil {
		t.Fatalf("seed identity user: %v", err)
	}

	ws, err := svc.CreateWorkspace(ctx, actor, "PG Members "+uuid.NewString()[:8], "", "")
	if err != nil {
		t.Fatal(err)
	}
	members, err := svc.ListMembers(ctx, actor, ws.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(members) != 1 {
		t.Fatalf("want 1 member, got %d", len(members))
	}
	if members[0].Name != "Ana Cruz" || members[0].Email != email {
		t.Errorf("member identity not read: name=%q email=%q", members[0].Name, members[0].Email)
	}

	// A membership whose identity row cannot be read is still a membership:
	// dropping it would hide somebody who holds authority in the workspace.
	stranger := uuid.NewString()
	if _, err := pool.Exec(ctx,
		`INSERT INTO developer.dev_workspace_members (workspace_id, user_id, role, accepted_at, status)
		 VALUES ($1, $2, 'VIEWER', now(), 'ACTIVE')`, ws.ID, stranger); err != nil {
		t.Fatal(err)
	}
	members, err = svc.ListMembers(ctx, actor, ws.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(members) != 2 {
		t.Fatalf("a member with no identity row was dropped from the list: got %d", len(members))
	}

	if _, err := svc.ArchiveWorkspace(ctx, actor, ws.ID, ws.Name, "", ""); err != nil {
		t.Fatal(err)
	}
	// An archived workspace leaves the switcher.
	all, err := svc.ListWorkspaces(ctx, actor)
	if err != nil {
		t.Fatal(err)
	}
	for _, w := range all {
		if w.ID == ws.ID {
			t.Error("an archived workspace is still listed for its owner")
		}
	}
}

// No lifecycle operation may destroy the person.
//
// On 2026-09-12 a real Console account was deleted — not by the product, but by
// a test harness whose cleanup ran `DELETE FROM identity_users WHERE email LIKE
// …` over the owner's own address. That was fixed where it belonged, in the
// harness. This is the other half: proving the PRODUCT never does it, so the
// guarantee does not rest on one script being careful.
//
// Deleting a workspace, deleting a project, removing a membership and leaving a
// workspace each end something the person HAS. None of them ends the person.
// Only an explicit account close may do that, and it is a separate ceremony.
func TestPgStore_NoLifecycleOperationDeletesTheGlobalIdentity(t *testing.T) {
	ctx := context.Background()
	svc, actor := pgLifecycleSvc(ctx, t)
	pool := svc.store.(*pgStore).pool

	email := "lifecycle-identity-" + uuid.NewString()[:8] + "@example.test"
	if _, err := pool.Exec(ctx,
		`INSERT INTO account_identity.identity_users (id, email, name, verified)
		 VALUES ($1, $2, 'Quem Fica', true)`, actor, email); err != nil {
		t.Fatalf("seed identity user: %v", err)
	}
	stillThere := func(what string) {
		t.Helper()
		var n int
		if err := pool.QueryRow(ctx,
			`SELECT count(*) FROM account_identity.identity_users WHERE id = $1`, actor).Scan(&n); err != nil {
			t.Fatalf("%s: reading the identity: %v", what, err)
		}
		if n != 1 {
			t.Fatalf("%s DELETED THE GLOBAL IDENTITY — the person is gone, not just their %s", what, what)
		}
	}

	// A project deleted outright.
	ws, err := svc.CreateWorkspace(ctx, actor, "Identity WS "+uuid.NewString()[:8], "", "")
	if err != nil {
		t.Fatal(err)
	}
	p, err := svc.CreateProject(ctx, actor, ws.ID, "Vazio", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.DeleteProject(ctx, actor, p.ID, p.Name, "", ""); err != nil {
		t.Fatalf("delete empty project: %v", err)
	}
	stillThere("PROJECT_DELETE")

	// The workspace deleted outright, now that it holds nothing.
	if _, err := svc.DeleteWorkspace(ctx, actor, ws.ID, ws.Name, "", ""); err != nil {
		t.Fatalf("delete empty workspace: %v", err)
	}
	stillThere("WORKSPACE_DELETE")

	// A membership removed, and a workspace left.
	ws2, err := svc.CreateWorkspace(ctx, actor, "Identity WS2 "+uuid.NewString()[:8], "", "")
	if err != nil {
		t.Fatal(err)
	}
	other := uuid.NewString()
	if _, err := pool.Exec(ctx,
		`INSERT INTO account_identity.identity_users (id, email, verified)
		 VALUES ($1, $2, true)`, other, "other-"+uuid.NewString()[:8]+"@example.test"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO developer.dev_workspace_members (workspace_id, user_id, role, accepted_at, status)
		 VALUES ($1, $2, 'DEVELOPER', now(), 'ACTIVE')`, ws2.ID, other); err != nil {
		t.Fatal(err)
	}
	if err := svc.RemoveMember(ctx, actor, ws2.ID, other, "", ""); err != nil {
		t.Fatalf("remove member: %v", err)
	}
	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM account_identity.identity_users WHERE id = $1`, other).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatal("MEMBERSHIP_REMOVE DELETED THE GLOBAL IDENTITY — removing somebody from a workspace ended their account")
	}
	stillThere("REMOVE_MEMBER")

	// And the actor leaving one of their own workspaces, once another owner exists.
	// A distinct identity: `other` was just removed, and the membership table is
	// unique on (workspace, user).
	second := uuid.NewString()
	if _, err := pool.Exec(ctx,
		`INSERT INTO account_identity.identity_users (id, email, verified)
		 VALUES ($1, $2, true)`, second, "second-"+uuid.NewString()[:8]+"@example.test"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO developer.dev_workspace_members (workspace_id, user_id, role, accepted_at, status)
		 VALUES ($1, $2, 'OWNER', now(), 'ACTIVE')`, ws2.ID, second); err != nil {
		t.Fatal(err)
	}
	if err := svc.LeaveWorkspace(ctx, actor, ws2.ID, "", ""); err != nil {
		t.Fatalf("leave workspace: %v", err)
	}
	stillThere("WORKSPACE_LEAVE")
}
