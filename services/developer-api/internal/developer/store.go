// Package developer is the Developer bounded context (ADR-033): workspaces,
// members, projects and sandbox API keys. It references Account Identity by
// opaque user id only, owns the developer.* schema, and never touches Business
// or Core. Slice 1 is Sandbox-only — no Live activation or business linking.
package developer

import (
	"context"
	"errors"
	"time"
)

// Roles (developer.dev_workspace_members.role).
const (
	RoleOwner     = "OWNER"
	RoleAdmin     = "ADMIN"
	RoleDeveloper = "DEVELOPER"
	RoleFinance   = "FINANCE"
	RoleViewer    = "VIEWER"
)

func ValidRole(r string) bool {
	switch r {
	case RoleOwner, RoleAdmin, RoleDeveloper, RoleFinance, RoleViewer:
		return true
	}
	return false
}

var (
	ErrNotFound    = errors.New("not found")
	ErrConflict    = errors.New("conflict")
	ErrForbidden   = errors.New("forbidden")
	ErrValidation  = errors.New("validation")
	ErrLastOwner   = errors.New("cannot remove or demote the last owner")
	ErrInviteState = errors.New("invite not acceptable")
	ErrUnavailable = errors.New("unavailable")
)

type Workspace struct {
	ID        string
	Name      string
	Slug      string
	CreatedBy string
	Status    string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Member struct {
	ID          string
	WorkspaceID string
	UserID      string
	Role        string
	Status      string
	CreatedAt   time.Time
}

type Invite struct {
	ID          string
	WorkspaceID string
	Email       string
	Role        string
	InvitedBy   string
	ExpiresAt   time.Time
	AcceptedAt  *time.Time
	RevokedAt   *time.Time
	CreatedAt   time.Time
}

type InviteInsert struct {
	WorkspaceID string
	Email       string
	Role        string
	TokenHash   string
	InvitedBy   string
	ExpiresAt   time.Time
}

// AuditEvent is a context-owned developer.audit_events record. Never carries raw
// secrets (API key material, invite tokens).
type AuditEvent struct {
	ActorUserID *string
	WorkspaceID *string
	ProjectID   *string
	Action      string
	Subject     string
	Metadata    map[string]any
	RequestIP   string
	RequestID   string
}

// Store is the Developer persistence port (developer.* schema).
type Store interface {
	// CreateWorkspace inserts the workspace and its creator's OWNER membership
	// atomically.
	CreateWorkspace(ctx context.Context, name, slug, ownerUserID string) (Workspace, error)
	WorkspacesForUser(ctx context.Context, userID string) ([]Workspace, error)
	Workspace(ctx context.Context, id string) (Workspace, error)

	Membership(ctx context.Context, workspaceID, userID string) (*Member, error)
	Members(ctx context.Context, workspaceID string) ([]Member, error)
	CountOwners(ctx context.Context, workspaceID string) (int, error)
	SetMemberRole(ctx context.Context, workspaceID, userID, role string) error
	RemoveMember(ctx context.Context, workspaceID, userID string) error

	CreateInvite(ctx context.Context, in InviteInsert) (Invite, error)
	ActiveInviteByEmail(ctx context.Context, workspaceID, email string) (*Invite, error)
	InviteByTokenHash(ctx context.Context, tokenHash string) (*Invite, error)
	// AcceptInvite marks the invite accepted and upserts the membership atomically.
	AcceptInvite(ctx context.Context, inviteID, userID string) (Member, error)
	RevokeInvite(ctx context.Context, inviteID string) error

	InsertAudit(ctx context.Context, ev AuditEvent) error
}
