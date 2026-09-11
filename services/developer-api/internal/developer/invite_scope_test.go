// An invite belongs to its workspace. The revoke named the invite by id alone,
// so the OWNER of any workspace — and anyone can create one — could revoke
// another workspace's pending invite by naming its id under their own
// workspace (A1-03). And the accept wrote accepted_at without re-checking the
// invite's state, so a revoke landing between the service's read and that write
// lost (A9-10).
package developer

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/common/env"
)

func TestRevokeInvite_AnotherWorkspacesInviteIsNotFound(t *testing.T) {
	s, _ := newSvc(time.Hour)
	victim, _ := s.CreateWorkspace(bg, "u_victim", "Victim", "", "")
	inv, raw, err := s.InviteMember(bg, "u_victim", victim.ID, "dev@x.co", RoleDeveloper, "", "")
	if err != nil {
		t.Fatal(err)
	}
	attacker, _ := s.CreateWorkspace(bg, "u_attacker", "Mine", "", "")

	if err := s.RevokeInvite(bg, "u_attacker", attacker.ID, inv.ID, "", ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("revoking another workspace's invite: want ErrNotFound, got %v", err)
	}
	// It is still the victim's to accept.
	if _, err := s.AcceptInvite(bg, "u_dev", "dev@x.co", raw, "", ""); err != nil {
		t.Fatalf("the invite should still be acceptable: %v", err)
	}
}

// The same guarantees against the real statements.
func TestPgInvite_ScopedRevokeAndPendingOnlyAccept(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	st := NewPGStore(pool, env.Parse("SANDBOX"))

	ws := func(name string) string {
		var id string
		if err := pool.QueryRow(ctx,
			`INSERT INTO developer.dev_workspaces (name, slug, created_by)
			 VALUES ($1, $1 || '-' || gen_random_uuid(), gen_random_uuid()) RETURNING id`, name).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	invite := func(wsID string) string {
		var id string
		if err := pool.QueryRow(ctx,
			`INSERT INTO developer.dev_workspace_invites (workspace_id, email, role, token_hash, expires_at)
			 VALUES ($1, 'dev@x.co', 'DEVELOPER', gen_random_uuid()::text, now() + interval '1 hour') RETURNING id`,
			wsID).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	victim, attacker := ws("victim"), ws("attacker")
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM developer.dev_workspaces WHERE id IN ($1,$2)`, victim, attacker)
	})

	inv := invite(victim)
	if err := st.RevokeInvite(ctx, attacker, inv); !errors.Is(err, ErrNotFound) {
		t.Fatalf("revoke under another workspace: want ErrNotFound, got %v", err)
	}
	var revoked *time.Time
	_ = pool.QueryRow(ctx, `SELECT revoked_at FROM developer.dev_workspace_invites WHERE id=$1`, inv).Scan(&revoked)
	if revoked != nil {
		t.Fatal("another workspace's invite was revoked")
	}

	// Revoked by its own workspace, it can no longer be accepted.
	if err := st.RevokeInvite(ctx, victim, inv); err != nil {
		t.Fatalf("owner revoke: %v", err)
	}
	if _, err := st.AcceptInvite(ctx, inv, "00000000-0000-0000-0000-00000000d00d"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("accepting a revoked invite: want ErrNotFound, got %v", err)
	}
	var members int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM developer.dev_workspace_members WHERE workspace_id=$1`, victim).Scan(&members)
	if members != 0 {
		t.Fatalf("a revoked invite made %d member(s)", members)
	}
}
