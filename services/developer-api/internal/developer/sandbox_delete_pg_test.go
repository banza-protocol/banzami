// Sandbox deletion against a real migrated database (SANDBOX-DELETE-001): the
// SQL that runs in production, including the races the in-memory store cannot
// reproduce. Lock order is workspace then project, share for creation and update
// for deletion, so a creation either lands before the deletion revokes what
// exists or is refused.
package developer

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/banzami/banzami/services/common/env"
)

func pgDeleteSvc(ctx context.Context, t *testing.T) (*Service, *pgStore) {
	t.Helper()
	pool := devPoolOrSkip(ctx, t)
	t.Cleanup(pool.Close)
	var def string
	if err := pool.QueryRow(ctx,
		`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'dev_projects_status_check'`).Scan(&def); err != nil {
		t.Fatalf("dev_projects_status_check missing: %v", err)
	}
	st := NewPGStore(pool, env.Sandbox).(*pgStore)
	svc := NewService(st, "invite-secret-fixture", "api-key-pepper-fixture", time.Hour)
	svc.SetSandboxEnvironment(true)
	svc.SetSandboxBusinessProvisioner(&fakeRetirer{})
	return svc, st
}

func TestPgStore_KeyCreationRacingDeletionLeavesNoActiveKey(t *testing.T) {
	ctx := context.Background()
	svc, st := pgDeleteSvc(ctx, t)
	actor := uuid.NewString()
	ws, err := svc.CreateWorkspace(ctx, actor, "Race "+uuid.NewString()[:8], "", "")
	if err != nil {
		t.Fatal(err)
	}
	p, err := svc.CreateProject(ctx, actor, ws.ID, "Race", "", "")
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	var created, refused int
	var mu sync.Mutex
	start := make(chan struct{})
	for i := 0; i < 24; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, err := st.CreateAPIKey(ctx, APIKeyInsert{
				ProjectID: p.ID, Environment: EnvSandbox, Kind: KindSecret, Name: "race",
				KeyPrefix: "bz_test_sk_", KeyHash: fmt.Sprintf("race-%s-%d", p.ID, i), HashVersion: 1,
				Scopes: []string{"identity:read"}, CreatedBy: actor,
			})
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				created++
			case errors.Is(err, ErrDeleting):
				refused++
			default:
				t.Errorf("key creation during deletion: unexpected %v", err)
			}
		}(i)
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		<-start
		time.Sleep(2 * time.Millisecond)
		if _, err := st.BeginProjectDeletion(ctx, p.ID); err != nil {
			t.Errorf("begin deletion: %v", err)
		}
	}()
	close(start)
	wg.Wait()

	var active int
	if err := st.pool.QueryRow(ctx,
		`SELECT count(*) FROM developer.dev_api_keys WHERE project_id = $1 AND status = 'ACTIVE'`, p.ID).Scan(&active); err != nil {
		t.Fatal(err)
	}
	if active != 0 {
		t.Fatalf("%d key(s) ACTIVE after deletion won the lifecycle (created=%d refused=%d)", active, created, refused)
	}
	if created+refused != 24 {
		t.Fatalf("every attempt must either land before the deletion or be refused: created=%d refused=%d", created, refused)
	}
	// Any key that landed first is refused at authentication too.
	if auth, err := st.APIKeyByHash(ctx, fmt.Sprintf("race-%s-0", p.ID)); err == nil && auth.Status == "ACTIVE" {
		t.Fatal("a key of a deleting project authenticates")
	}
}

func TestPgStore_DeletionTombstoneReleasesTheNameAndHidesTheProject(t *testing.T) {
	ctx := context.Background()
	svc, st := pgDeleteSvc(ctx, t)
	actor := uuid.NewString()
	ws, err := svc.CreateWorkspace(ctx, actor, "Tomb "+uuid.NewString()[:8], "", "")
	if err != nil {
		t.Fatal(err)
	}
	p, err := svc.CreateProject(ctx, actor, ws.ID, "Mesmo nome", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.CreateAPIKey(ctx, actor, p.ID, KindSecret, "k", []string{"identity:read"}, "", ""); err != nil {
		t.Fatal(err)
	}
	d, _, err := svc.DeleteProject(ctx, actor, p.ID, "Mesmo nome", "", "")
	if err != nil || d.Status != StatusDeleting || d.KeysRevoked != 1 {
		t.Fatalf("delete: %v %+v", err, d)
	}
	list, _ := st.ProjectsForWorkspace(ctx, ws.ID, true)
	if len(list) != 0 {
		t.Fatalf("a deleting project is listed: %+v", list)
	}
	if err := st.FinishProjectDeletion(ctx, p.ID); err != nil {
		t.Fatal(err)
	}
	var status, name, slug string
	if err := st.pool.QueryRow(ctx, `SELECT status, name, slug FROM developer.dev_projects WHERE id = $1`, p.ID).Scan(&status, &name, &slug); err != nil {
		t.Fatal(err)
	}
	if status != StatusDeleted || name == "Mesmo nome" || slug == p.Slug {
		t.Fatalf("tombstone: %s %q %q", status, name, slug)
	}
	again, err := svc.CreateProject(ctx, actor, ws.ID, "Mesmo nome", "", "")
	if err != nil || again.ID == p.ID || again.Slug != p.Slug {
		t.Fatalf("the released slug is reused by a NEW project: %v %+v (old slug %q)", err, again, p.Slug)
	}
}

func TestPgStore_WorkspaceDeletionRevokesMembersInvitesAndChildren(t *testing.T) {
	ctx := context.Background()
	svc, st := pgDeleteSvc(ctx, t)
	owner, member := uuid.NewString(), uuid.NewString()
	ws, err := svc.CreateWorkspace(ctx, owner, "Cascade "+uuid.NewString()[:8], "", "")
	if err != nil {
		t.Fatal(err)
	}
	inv, raw, err := svc.InviteMember(ctx, owner, ws.ID, "member-"+uuid.NewString()[:6]+"@x.co", RoleDeveloper, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.AcceptInvite(ctx, member, inv.Email, raw, "", ""); err != nil {
		t.Fatal(err)
	}
	pending, _, err := svc.InviteMember(ctx, owner, ws.ID, "pending-"+uuid.NewString()[:6]+"@x.co", RoleViewer, "", "")
	if err != nil {
		t.Fatal(err)
	}
	a, _ := svc.CreateProject(ctx, owner, ws.ID, "A", "", "")
	b, _ := svc.CreateProject(ctx, owner, ws.ID, "B", "", "")
	if _, err := svc.ArchiveProject(ctx, owner, b.ID, "B", "", ""); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.CreateAPIKey(ctx, owner, a.ID, KindSecret, "k", []string{"identity:read"}, "", ""); err != nil {
		t.Fatal(err)
	}

	d, _, err := svc.DeleteWorkspace(ctx, owner, ws.ID, ws.Name, "", "")
	if err != nil || d.Status != StatusDeleting {
		t.Fatalf("workspace delete: %v %+v", err, d)
	}
	if m, _ := st.Membership(ctx, ws.ID, member); m != nil {
		t.Fatal("a member keeps authority in a deleting workspace")
	}
	var revokedAt *time.Time
	_ = st.pool.QueryRow(ctx, `SELECT revoked_at FROM developer.dev_workspace_invites WHERE id = $1`, pending.ID).Scan(&revokedAt)
	if revokedAt == nil {
		t.Fatal("a pending invite survived the deletion")
	}
	for _, p := range []Project{a, b} {
		got, _ := st.Project(ctx, p.ID)
		if got.Status != StatusDeleting {
			t.Fatalf("project %s: %s", p.Name, got.Status)
		}
	}
	if err := st.FinishWorkspaceDeletion(ctx, ws.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("a workspace is not finished while a project is still DELETING: %v", err)
	}
	for _, p := range []Project{a, b} {
		if err := st.FinishProjectDeletion(ctx, p.ID); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.FinishWorkspaceDeletion(ctx, ws.ID); err != nil {
		t.Fatal(err)
	}
	var members int
	_ = st.pool.QueryRow(ctx, `SELECT count(*) FROM developer.dev_workspace_members WHERE workspace_id = $1`, ws.ID).Scan(&members)
	if members != 0 {
		t.Fatalf("%d membership rows remain", members)
	}
}

func TestPgStore_ConcurrentDeletesRecordTheDeletionOnce(t *testing.T) {
	ctx := context.Background()
	svc, st := pgDeleteSvc(ctx, t)
	actor := uuid.NewString()
	ws, err := svc.CreateWorkspace(ctx, actor, "Twice "+uuid.NewString()[:8], "", "")
	if err != nil {
		t.Fatal(err)
	}
	p, err := svc.CreateProject(ctx, actor, ws.ID, "Twice", "", "")
	if err != nil {
		t.Fatal(err)
	}
	other, err := svc.CreateProject(ctx, actor, ws.ID, "Other", "", "")
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 8; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			if d, _, err := svc.DeleteProject(ctx, actor, p.ID, "Twice", "", ""); err != nil || d.Status != StatusDeleting {
				t.Errorf("a concurrent delete must succeed as DELETING: %v %+v", err, d)
			}
		}()
		go func() {
			defer wg.Done()
			<-start
			if d, _, err := svc.DeleteWorkspace(ctx, actor, ws.ID, ws.Name, "", ""); err != nil || d.Status != StatusDeleting {
				t.Errorf("a concurrent workspace delete must succeed as DELETING: %v %+v", err, d)
			}
		}()
	}
	close(start)
	wg.Wait()
	count := func(action, subject string) int {
		var n int
		if err := st.pool.QueryRow(ctx,
			`SELECT count(*) FROM developer.audit_events WHERE action = $1 AND subject = $2`, action, subject).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if n := count("project.deletion_requested", "PROJECT:"+p.ID); n > 1 {
		t.Fatalf("project deletion recorded %d times", n)
	}
	if n := count("workspace.deletion_requested", "WORKSPACE:"+ws.ID); n != 1 {
		t.Fatalf("workspace deletion recorded %d times", n)
	}
	for _, id := range []string{p.ID, other.ID} {
		if got, _ := st.Project(ctx, id); got == nil || got.Status != StatusDeleting {
			t.Fatalf("project %s not DELETING: %+v", id, got)
		}
	}
}
