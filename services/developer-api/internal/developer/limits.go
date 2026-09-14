package developer

import (
	"context"
	"time"
)

// Self-service creation limits (SANDBOX-SELF-SERVICE-001).
//
// Anyone with a mailbox can sign in, and every Project's Sandbox setup
// provisions a Business, a wallet and ledger accounts in Core. Without a bound,
// one account could create Businesses without end — archiving to make room and
// creating again. The limits are far above what a developer uses (the busiest
// account in the Sandbox had 2 workspaces and 1 project each when they were
// set) and are counted on what was created, so archiving frees an ACTIVE place
// but not the day's allowance.
const (
	MaxActiveWorkspacesPerUser    = 10
	MaxWorkspacesCreatedPerDay    = 20
	MaxActiveProjectsPerWorkspace = 25
	MaxProjectsCreatedPerDay      = 50
)

func (s *Service) admitWorkspace(ctx context.Context, actor string) error {
	active, created, err := s.store.WorkspaceCreationCounts(ctx, actor, time.Now().Add(-24*time.Hour))
	if err != nil {
		return ErrUnavailable
	}
	if active >= MaxActiveWorkspacesPerUser || created >= MaxWorkspacesCreatedPerDay {
		return ErrWorkspaceQuota
	}
	return nil
}

func (s *Service) admitProject(ctx context.Context, workspaceID string) error {
	active, created, err := s.store.ProjectCreationCounts(ctx, workspaceID, time.Now().Add(-24*time.Hour))
	if err != nil {
		return ErrUnavailable
	}
	if active >= MaxActiveProjectsPerWorkspace || created >= MaxProjectsCreatedPerDay {
		return ErrProjectQuota
	}
	return nil
}
