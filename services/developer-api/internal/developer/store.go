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

// Key kinds and environments.
const (
	KindPublishable = "PUBLISHABLE"
	KindSecret      = "SECRET"
	EnvSandbox      = "SANDBOX"
	EnvLive         = "LIVE"
)

// AllowedScopes is the closed set of scopes a sandbox key may carry (Slice 1).
// identity:read is the only scope backed by a RELEASED public route (GET /v1/me,
// ADR-046). The rest are recorded but not enforced by any public route — their
// capabilities are pending-e2e and dev keys cannot reach them.
var AllowedScopes = map[string]bool{
	"identity:read":   true,
	"payments:read":   true,
	"payments:write":  true,
	"transfers:read":  true,
	"transfers:write": true,
	"refunds:write":   true,
	"webhooks:read":   true,
	"webhooks:write":  true,
	"customers:read":  true,
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

	// Projects
	CreateProject(ctx context.Context, workspaceID, name, slug string) (Project, error)
	ProjectsForWorkspace(ctx context.Context, workspaceID string) ([]Project, error)
	Project(ctx context.Context, id string) (*Project, error)

	// API keys
	CreateAPIKey(ctx context.Context, in APIKeyInsert) (APIKey, error)
	APIKeysForProject(ctx context.Context, projectID string) ([]APIKey, error)
	APIKeyByID(ctx context.Context, id string) (*APIKey, error)
	APIKeyByHash(ctx context.Context, keyHash string) (*APIKeyAuth, error)
	RevokeAPIKey(ctx context.Context, id string) error
	// RotateAPIKey atomically inserts the replacement (rotated_from=oldID) and
	// revokes the old key.
	RotateAPIKey(ctx context.Context, oldID string, replacement APIKeyInsert) (APIKey, error)

	InsertAudit(ctx context.Context, ev AuditEvent) error
}

type Project struct {
	ID          string
	WorkspaceID string
	Name        string
	Slug        string
	Status      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// APIKey is key metadata — never carries the secret hash or a raw secret.
type APIKey struct {
	ID          string
	ProjectID   string
	Environment string
	Kind        string // PUBLISHABLE | SECRET
	Name        string
	KeyPrefix   string
	PublicValue string // full pk value (PUBLISHABLE only); empty for SECRET
	Scopes      []string
	Status      string
	RotatedFrom *string
	CreatedAt   time.Time
	LastUsedAt  *time.Time
}

type APIKeyInsert struct {
	ProjectID   string
	Environment string
	Kind        string
	Name        string
	KeyPrefix   string
	KeyHash     string // HMAC(raw, API_KEY_PEPPER)
	HashVersion int
	PublicValue string
	Scopes      []string
	CreatedBy   string
	RotatedFrom *string
}

// APIKeyAuth is the minimal record returned when authorizing a presented key.
type APIKeyAuth struct {
	ID          string
	ProjectID   string
	Environment string
	Status      string
	Scopes      []string
}
