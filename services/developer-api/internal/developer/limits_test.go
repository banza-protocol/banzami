package developer

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/banzami/banzami/services/common/env"
)

// Each Project's Sandbox setup provisions a Business in Core; one account must
// not create them without end, archiving to make room and creating again.
func TestLimits_WorkspacesAreBoundedActiveAndPerDay(t *testing.T) {
	s, st := newSvc(time.Hour)
	for i := 0; i < MaxActiveWorkspacesPerUser; i++ {
		if _, err := s.CreateWorkspace(bg, "u_busy", fmt.Sprintf("WS %d", i), "", ""); err != nil {
			t.Fatalf("workspace %d refused below the limit: %v", i+1, err)
		}
	}
	if _, err := s.CreateWorkspace(bg, "u_busy", "One more", "", ""); err != ErrWorkspaceQuota {
		t.Fatalf("over the active limit: %v", err)
	}
	// Another person is not counted against this one.
	if _, err := s.CreateWorkspace(bg, "u_other", "Mine", "", ""); err != nil {
		t.Fatalf("another user: %v", err)
	}
	// Archiving frees an ACTIVE place — but not the day's allowance.
	for i := 0; i < MaxWorkspacesCreatedPerDay; i++ {
		for _, w := range st.workspaces {
			if w.CreatedBy == "u_busy" && w.Status == "ACTIVE" {
				w.Status = "ARCHIVED"
				break
			}
		}
		_, err := s.CreateWorkspace(bg, "u_busy", fmt.Sprintf("Churn %d", i), "", "")
		if i < MaxWorkspacesCreatedPerDay-MaxActiveWorkspacesPerUser && err != nil {
			t.Fatalf("churn %d refused within the daily allowance: %v", i, err)
		}
		if i >= MaxWorkspacesCreatedPerDay-MaxActiveWorkspacesPerUser && err != ErrWorkspaceQuota {
			t.Fatalf("churn %d past the daily allowance: %v", i, err)
		}
	}
}

func TestLimits_ProjectsAreBoundedPerWorkspace(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	for i := 0; i < MaxActiveProjectsPerWorkspace; i++ {
		if _, err := s.CreateProject(bg, "u_dev", ws, fmt.Sprintf("P %d", i), "", ""); err != nil {
			t.Fatalf("project %d refused below the limit: %v", i+1, err)
		}
	}
	if _, err := s.CreateProject(bg, "u_owner", ws, "One more", "", ""); err != ErrProjectQuota {
		t.Fatalf("over the limit: %v", err)
	}
	other, _ := s.CreateWorkspace(bg, "u_owner", "Other", "", "")
	if _, err := s.CreateProject(bg, "u_owner", other.ID, "Fine", "", ""); err != nil {
		t.Fatalf("another workspace: %v", err)
	}
}

func TestPgStore_CreationCounts(t *testing.T) {
	ctx := context.Background()
	pool := devPoolOrSkip(ctx, t)
	defer pool.Close()
	st := NewPGStore(pool, env.Sandbox)
	actor := uuid.NewString()
	a, err := st.CreateWorkspace(ctx, "Limits A", "limits-a-"+actor[:8], actor)
	if err != nil {
		t.Fatal(err)
	}
	b, err := st.CreateWorkspace(ctx, "Limits B", "limits-b-"+actor[:8], actor)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE developer.dev_workspaces SET status='ARCHIVED' WHERE id=$1`, b.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := st.CreateProject(ctx, a.ID, "P", "p"); err != nil {
		t.Fatal(err)
	}
	active, created, err := st.WorkspaceCreationCounts(ctx, actor, time.Now().Add(-time.Hour))
	if err != nil || active != 1 || created != 2 {
		t.Fatalf("workspaces: active=%d created=%d err=%v", active, created, err)
	}
	if _, created, _ := st.WorkspaceCreationCounts(ctx, actor, time.Now().Add(time.Hour)); created != 0 {
		t.Fatalf("a window after both creations counted %d", created)
	}
	pa, pc, err := st.ProjectCreationCounts(ctx, a.ID, time.Now().Add(-time.Hour))
	if err != nil || pa != 1 || pc != 1 {
		t.Fatalf("projects: active=%d created=%d err=%v", pa, pc, err)
	}
}
