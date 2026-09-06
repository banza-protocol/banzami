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

// ClientSafeScopes is the subset a PUBLISHABLE key may hold.
//
// A publishable key is, by definition, meant to be embedded in something a user
// can read: a mobile binary, a browser bundle. Anyone who has the app has the
// key. Nothing restricted what one could carry, so a publishable key could be
// issued with `transfers:write` or `refunds:write` — financial write authority
// shipped inside an app store download, and the gateway accepts `bz_test_pk_`
// on those routes.
//
// The rule is about what the credential can DO, not where it is used: a
// publishable key may look things up and read the state of a payment it was
// given, and it may never move money or open an account. Financial writes need
// a secret key, which belongs on a server.
var ClientSafeScopes = map[string]bool{
	"identity:read":         true,
	"payment_sessions:read": true,
	"payment_links:read":    true,
	"payments:read":         true,
	"transfers:read":        true,
	"refunds:read":          true,
	"customers:read":        true,
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
	"customers:read":                true, // resolve a @banza before naming it a beneficiary
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
	// ArchiveProject retires a project and revokes every key still ACTIVE on it,
	// in one transaction. Retiring a project while its credentials stay live
	// would leave authority pointing at something nothing is watching any more.
	ArchiveProject(ctx context.Context, id string) (keysRevoked int, err error)

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
	// SupersedeAndCreateBinding replaces a project's ACTIVE binding with a new
	// one in ONE transaction: the old row moves to DISABLED and the new row is
	// inserted. Two statements would leave a window in which the project has no
	// payee at all, and a failure between them would leave it unbound.
	SupersedeAndCreateBinding(ctx context.Context, in BindingInsert) (SandboxBinding, string, error)

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
	// WalletAccountsForMerchant returns the wallet accounts belonging to the
	// merchant a project's binding names, with the balance each one actually
	// holds. The balance is summed from ledger entries in SQL rather than
	// returned from a stored total: a cached figure that drifts from the ledger
	// is worse than no figure, because it looks authoritative.
	//
	// Read-only, like every other view here. There is no write counterpart.
	WalletAccountsForMerchant(ctx context.Context, merchantID string, f WalletAccountFilter) ([]WalletAccountView, error)
	WalletAccountCountForMerchant(ctx context.Context, merchantID string) (int, error)

	// TransactionsForMerchant returns the financial operations that happened
	// under the merchant a project is bound to: payment sessions, refunds and
	// wallet-account transfers. Three released types, unioned into one ordered
	// stream, each keeping its own type so nothing is flattened into a generic
	// "transaction" that means less than the row it came from.
	//
	// Not the same question as the API log. The log says which HTTP requests
	// arrived; this says which money moved.
	TransactionsForMerchant(ctx context.Context, merchantID string, f TransactionFilter) ([]TransactionView, error)

	WebhookEndpointsForMerchant(ctx context.Context, merchantID string) ([]WebhookEndpointView, error)
	WebhookEventsForMerchant(ctx context.Context, merchantID string, limit int) ([]WebhookEventView, error)
	WebhookDeliveriesForEvent(ctx context.Context, merchantID, eventID string) ([]WebhookDeliveryView, error)

	// APIRequestLogs returns the project's own Developer API request log. The
	// project id is applied inside the query, so a filter can narrow the result
	// but can never widen it past one project.
	APIRequestLogs(ctx context.Context, projectID string, f RequestLogFilter) ([]APIRequestLogView, error)

	// APIRequestLogSummary aggregates the same project-scoped rows. Computed in
	// SQL rather than from the returned page, which is capped: a total derived
	// from 100 rows would be a number that looks like traffic and is really a
	// page size.
	APIRequestLogSummary(ctx context.Context, projectID string, f RequestLogFilter) (RequestLogSummary, error)
}

// RequestLogSummary is the Console Overview's real numbers for one project.
type RequestLogSummary struct {
	Requests    int               `json:"requests"`
	Errors      int               `json:"errors"`
	MedianMS    *int              `json:"median_latency_ms,omitempty"`
	ByDay       []RequestDayCount `json:"by_day"`
	WindowStart *time.Time        `json:"window_start,omitempty"`
}

type RequestDayCount struct {
	Day   string `json:"day"`
	Count int    `json:"count"`
}

// RequestLogRetentionDays is how long a Developer API request log line is kept.
// It matches service.RequestLogRetention in the api-gateway, which does the
// pruning; the Console reports it so an absent old request reads as retention
// and not as a lost record. Diagnostic telemetry only — audit events are
// immutable and governed separately.
const RequestLogRetentionDays = 30

// RequestLogFilter narrows a project's request log. Every field is optional and
// none of them can select another project's rows.
type RequestLogFilter struct {
	Limit     int
	RequestID string // exact match — the correlation lookup
	Status    int    // exact status, e.g. 404
	Path      string // case-insensitive substring of path or route
	Since     *time.Time
	Until     *time.Time
}

// APIRequestLogView is one logged Developer API request as the Console shows it.
// The fields are the whole record (migration 0104): no header, no body, no
// credential. What is absent here is absent in the database too.
type APIRequestLogView struct {
	ID          string    `json:"id"`
	Method      string    `json:"method"`
	Path        string    `json:"path"`
	Route       string    `json:"route,omitempty"`
	Status      int       `json:"status"`
	RequestID   string    `json:"request_id"`
	LatencyMS   *int      `json:"latency_ms,omitempty"`
	Environment string    `json:"environment"`
	CreatedAt   time.Time `json:"created_at"`
}

// WebhookEndpointView is an endpoint as the Console shows it. The signing secret
// is absent from the struct, not merely unselected — a field that does not exist
// cannot be leaked by a later change to a query.
// WalletAccountView is what a Developer may see of one wallet account: what it
// is for, what it holds, and nothing about the ledger underneath it. No account
// id from the ledger, no posting, no merchant identifier — those belong to the
// operator, and a Developer read model that exposed them would make every
// integration depend on internals it cannot be promised.
type WalletAccountView struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	// Coalesced in SQL, like the transaction view and for the same reason.
	Purpose       string `json:"purpose"`
	ReferenceType string `json:"reference_type"`
	ReferenceID   string `json:"reference_id"`
	Currency      string    `json:"currency"`
	// BalanceMinor is the sum of the account's ledger entries, in minor units.
	// Sandbox balances move only through Sandbox operations.
	BalanceMinor int64     `json:"balance_minor"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
}

// WalletAccountFilter pages through a merchant's accounts. Cursor is the id of
// the last row of the previous page, and ordering is (created_at DESC, id DESC)
// so the sequence is stable when several accounts share a timestamp — which
// they do, because a run of campaigns is opened in the same second.
type WalletAccountFilter struct {
	Limit  int
	Cursor string
}

// TransactionView is one financial operation as a Developer may see it.
//
// No payer identity, no ledger posting, no merchant id: those are the
// operator's, and a read model that leaked them would make every integration
// depend on internals nobody promised to keep.
type TransactionView struct {
	ID   string `json:"id"`
	Type string `json:"type"` // payment | refund | transfer
	// Nullable columns are coalesced to "" in SQL rather than scanned into
	// pointers. A UNION over three tables makes some of these NULL on some
	// branches, and a page that happened to contain only non-null rows scanned
	// cleanly while the next one failed — which is how this arrived as a 503
	// that appeared only past the twenty-first row.
	Status string `json:"status"`
	// Null for a session opened without a fixed amount — the payer chooses.
	// Coalescing it to 0 would print "0 Kz" for an operation that has no amount
	// yet, which is a number where there is none.
	AmountMinor     *int64 `json:"amount_minor"`
	Currency        string `json:"currency"`
	WalletAccountID string `json:"wallet_account_id"`
	ReferenceType   string    `json:"reference_type"`
	ReferenceID     string    `json:"reference_id"`
	CreatedAt       time.Time `json:"created_at"`
}

// TransactionFilter narrows and pages the stream. Every field is applied in
// SQL: filtering a capped page in the browser answers a different question from
// the one the user asked, and answers it wrongly as soon as there is history.
type TransactionFilter struct {
	Limit  int
	Cursor string // created_at of the last row of the previous page, RFC3339
	Type   string // payment | refund | transfer
	Status string
	Since  *time.Time
	Until  *time.Time
}

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
