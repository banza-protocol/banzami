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
