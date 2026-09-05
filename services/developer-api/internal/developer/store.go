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

// AllowedScopes is the closed set of scopes a sandbox key may carry.
// identity:read is backed by a RELEASED public route (GET /v1/me, ADR-046).
// payment_sessions:* and payment_links:* are the ADR-047 payment scopes: a dev
// key may reach a payment route only if it holds the matching scope AND its
// Project has an ACTIVE binding (the Gateway enforces both). read and write are
// distinct — a read scope never authorizes a mutation. The remaining scopes are
// recorded but not yet enforced by any released route (pending-e2e).
var AllowedScopes = map[string]bool{
	"identity:read":          true,
	"payment_sessions:read":  true,
	"payment_sessions:write": true,
	// Wallet accounts are segregation WITHIN the project's bound owner: which of
	// my own accounts, never whose money. Read and create are separate because
	// listing is a far weaker capability than opening a new account.
	"wallet_accounts:read":   true,
	"wallet_accounts:create": true,
	// Settlement MOVES money out to a beneficiary. It gets its own scope rather
	// than riding on a payment or wallet scope, so granting an app the ability
	// to take payments never silently grants the ability to pay funds away.
	"application_settlements:write": true,
	"payment_links:read":            true,
	"payment_links:write":           true,
	"payments:read":                 true,
	"payments:write":                true,
	"transfers:read":                true,
	"transfers:write":               true,
	"refunds:read":                  true,
	"refunds:write":                 true,
	"webhooks:read":                 true,
	"webhooks:write":                true,
	"customers:read":                true,
}

// EnforcedScopes is the subset of AllowedScopes that a released Gateway route
// actually checks. The rest of AllowedScopes is recorded-but-inert: a key can
// carry `refunds:write` and no route will ever consult it.
//
// This distinction is not cosmetic. The Console's scope picker offered eight
// scopes, every one of them inert, and none of the eight the golden journey
// needs — so a developer following the public Quickstart could not build a key
// that worked. Offering a scope that authorizes nothing is a promise the
// product does not keep.
//
// Keep this in step with the Gateway handlers; the Console's picker is tied to
// it by a test in apps/website.
var EnforcedScopes = map[string]bool{
	"identity:read":                 true, // GET /v1/me
	"payment_sessions:read":         true,
	"payment_sessions:write":        true,
	"payment_links:read":            true,
	"payment_links:write":           true,
	"wallet_accounts:read":          true,
	"wallet_accounts:create":        true,
	"application_settlements:write": true,
	"webhooks:read":                 true, // endpoints, events, deliveries
	"webhooks:write":                true, // register, deactivate, replay, rotate secret
	"refunds:read":                  true, // read your own refunds
	"refunds:write":                 true, // return money from your own payment
	"transfers:write":               true, // move money between your own accounts
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

	// Project→Merchant Sandbox binding (ADR-047).
	// CreateBinding inserts an ACTIVE binding; the DB partial unique index rejects
	// a second ACTIVE binding for the same project (→ ErrConflict).
	CreateBinding(ctx context.Context, in BindingInsert) (SandboxBinding, error)
	// ActiveBindingForProject returns the project's ACTIVE binding, or nil.
	ActiveBindingForProject(ctx context.Context, projectID string) (*SandboxBinding, error)
	// MarkBindingArtifactCreated flips artifact_created true (idempotent), sealing
	// the binding against rebinding. Called when the first payment artifact is made.
	MarkBindingArtifactCreated(ctx context.Context, bindingID string) error

	InsertAudit(ctx context.Context, ev AuditEvent) error

	// Webhook visibility (ADR-051 follow-up).
	//
	// These read the gateway's webhook tables directly, scoped by the merchant
	// the project's own binding names. That is deliberate: the Console is
	// session-authenticated, so it cannot carry a project API key, and the
	// alternative — an internal channel where developer-api asserts a merchant id
	// to the gateway — would give this service the standing ability to speak for
	// any merchant it holds a binding for. Reading rows it can already reach,
	// scoped by a value it derives itself, adds no authority that did not already
	// exist.
	//
	// Read-only by construction: there is no write counterpart, and no query
	// selects the signing secret.
	WebhookEndpointsForMerchant(ctx context.Context, merchantID string) ([]WebhookEndpointView, error)
	WebhookEventsForMerchant(ctx context.Context, merchantID string, limit int) ([]WebhookEventView, error)
	WebhookDeliveriesForEvent(ctx context.Context, merchantID, eventID string) ([]WebhookDeliveryView, error)
}

// WebhookEndpointView is an endpoint as the Console shows it. The signing secret
// is absent from the struct, not merely unselected — a field that does not exist
// cannot be leaked by a later change to a query.
type WebhookEndpointView struct {
	ID        string    `json:"id"`
	URL       string    `json:"url"`
	Events    []string  `json:"events"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
}

type WebhookEventView struct {
	ID        string    `json:"id"`
	EventType string    `json:"event_type"`
	CreatedAt time.Time `json:"created_at"`
}

type WebhookDeliveryView struct {
	ID           string     `json:"id"`
	EventID      string     `json:"event_id"`
	EndpointID   string     `json:"endpoint_id"`
	Status       string     `json:"status"`
	StatusCode   *int       `json:"status_code,omitempty"`
	AttemptCount int        `json:"attempt_count"`
	DeliveredAt  *time.Time `json:"delivered_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
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

// SandboxBinding is a Project→Merchant payee binding (ADR-047). merchant_id,
// wallet_id and wallet_account_id are OPAQUE core ids (no FK); developer-api
// never interprets them beyond passing them to the Gateway via introspection.
type SandboxBinding struct {
	ID              string
	ProjectID       string
	Environment     string
	MerchantID      string
	WalletID        string
	WalletAccountID string
	State           string
	ArtifactCreated bool
	CreatedByUserID string
	CreatedAt       time.Time
}

type BindingInsert struct {
	ProjectID       string
	MerchantID      string
	WalletID        string
	WalletAccountID string
	CreatedByUserID string
}
