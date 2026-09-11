package developer

import (
	"context"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// memStore is an in-memory Store with the same semantics as pgStore (tests /
// local dev). Concurrency-safe.
type memStore struct {
	mu               sync.Mutex
	seq              int
	workspaces       map[string]*Workspace
	members          []*Member
	invites          map[string]*Invite
	inviteHash       map[string]string // tokenHash -> inviteID
	projects         map[string]*Project
	apiKeys          []*apiKeyRec
	bindings         []*SandboxBinding
	requestLogs      []memRequestLog
	webhookEndpoints map[string]*memWebhookEndpoint

	Audits []AuditEvent
}

// memWebhookEndpoint keeps the owner and the stored secret beside the view, so
// the in-memory store can enforce the same merchant scoping the SQL does and
// still never hand the secret back.
type memWebhookEndpoint struct {
	merchantID string
	secret     string
	view       WebhookEndpointView
}

// memRequestLog pairs a log row with the project that owns it, so the in-memory
// store can enforce the same one-project scoping the SQL does.
type memRequestLog struct {
	projectID string
	view      APIRequestLogView
}

// apiKeyRec holds the full key row incl. the secret hash (never exposed).
type apiKeyRec struct {
	APIKey
	keyHash string
}

// NewMemStore builds an in-memory developer Store.
func NewMemStore() *memStore {
	return &memStore{
		workspaces: map[string]*Workspace{},
		invites:    map[string]*Invite{},
		inviteHash: map[string]string{},
		projects:   map[string]*Project{},
	}
}

func (m *memStore) id(prefix string) string { m.seq++; return prefix + strconv.Itoa(m.seq) }

func (m *memStore) CreateWorkspace(_ context.Context, name, slug, owner string) (Workspace, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, w := range m.workspaces {
		if w.Slug == slug {
			return Workspace{}, ErrConflict
		}
	}
	now := time.Now()
	ws := &Workspace{ID: m.id("ws_"), Name: name, Slug: slug, CreatedBy: owner, Status: "ACTIVE", CreatedAt: now, UpdatedAt: now}
	m.workspaces[ws.ID] = ws
	m.members = append(m.members, &Member{ID: m.id("mem_"), WorkspaceID: ws.ID, UserID: owner, Role: RoleOwner, Status: "ACTIVE", CreatedAt: now})
	return *ws, nil
}

func (m *memStore) WorkspacesForUser(_ context.Context, userID string) ([]Workspace, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Workspace
	for _, mem := range m.members {
		if mem.UserID == userID && mem.Status == "ACTIVE" {
			if w, ok := m.workspaces[mem.WorkspaceID]; ok {
				out = append(out, *w)
			}
		}
	}
	return out, nil
}

func (m *memStore) Workspace(_ context.Context, id string) (Workspace, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if w, ok := m.workspaces[id]; ok {
		return *w, nil
	}
	return Workspace{}, ErrNotFound
}

func (m *memStore) memberRef(workspaceID, userID string) *Member {
	for _, mem := range m.members {
		if mem.WorkspaceID == workspaceID && mem.UserID == userID {
			return mem
		}
	}
	return nil
}

func (m *memStore) Membership(_ context.Context, workspaceID, userID string) (*Member, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if mem := m.memberRef(workspaceID, userID); mem != nil && mem.Status == "ACTIVE" {
		cp := *mem
		return &cp, nil
	}
	return nil, ErrNotFound
}

func (m *memStore) Members(_ context.Context, workspaceID string) ([]Member, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Member
	for _, mem := range m.members {
		if mem.WorkspaceID == workspaceID && mem.Status == "ACTIVE" {
			out = append(out, *mem)
		}
	}
	return out, nil
}

func (m *memStore) CountOwners(_ context.Context, workspaceID string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, mem := range m.members {
		if mem.WorkspaceID == workspaceID && mem.Status == "ACTIVE" && mem.Role == RoleOwner {
			n++
		}
	}
	return n, nil
}

func (m *memStore) SetMemberRole(_ context.Context, workspaceID, userID, role string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if mem := m.memberRef(workspaceID, userID); mem != nil && mem.Status == "ACTIVE" {
		mem.Role = role
		return nil
	}
	return ErrNotFound
}

func (m *memStore) RemoveMember(_ context.Context, workspaceID, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if mem := m.memberRef(workspaceID, userID); mem != nil && mem.Status == "ACTIVE" {
		mem.Status = "REMOVED"
		return nil
	}
	return ErrNotFound
}

func (m *memStore) CreateInvite(_ context.Context, in InviteInsert) (Invite, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	inv := &Invite{
		ID: m.id("inv_"), WorkspaceID: in.WorkspaceID, Email: strings.ToLower(in.Email),
		Role: in.Role, InvitedBy: in.InvitedBy, ExpiresAt: in.ExpiresAt, CreatedAt: now,
	}
	m.invites[inv.ID] = inv
	m.inviteHash[in.TokenHash] = inv.ID
	return *inv, nil
}

func (m *memStore) ActiveInviteByEmail(_ context.Context, workspaceID, email string) (*Invite, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	el := strings.ToLower(email)
	for _, inv := range m.invites {
		if inv.WorkspaceID == workspaceID && inv.Email == el && inv.AcceptedAt == nil && inv.RevokedAt == nil && time.Now().Before(inv.ExpiresAt) {
			cp := *inv
			return &cp, nil
		}
	}
	return nil, ErrNotFound
}

func (m *memStore) InviteByTokenHash(_ context.Context, tokenHash string) (*Invite, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id, ok := m.inviteHash[tokenHash]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *m.invites[id]
	return &cp, nil
}

func (m *memStore) AcceptInvite(_ context.Context, inviteID, userID string) (Member, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	inv, ok := m.invites[inviteID]
	if !ok || inv.AcceptedAt != nil || inv.RevokedAt != nil || time.Now().After(inv.ExpiresAt) {
		return Member{}, ErrNotFound
	}
	now := time.Now()
	inv.AcceptedAt = &now
	if mem := m.memberRef(inv.WorkspaceID, userID); mem != nil {
		mem.Status = "ACTIVE"
		mem.Role = inv.Role
		return *mem, nil
	}
	mem := &Member{ID: m.id("mem_"), WorkspaceID: inv.WorkspaceID, UserID: userID, Role: inv.Role, Status: "ACTIVE", CreatedAt: now}
	m.members = append(m.members, mem)
	return *mem, nil
}

func (m *memStore) RevokeInvite(_ context.Context, workspaceID, inviteID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if inv, ok := m.invites[inviteID]; ok && inv.WorkspaceID == workspaceID && inv.AcceptedAt == nil && inv.RevokedAt == nil {
		now := time.Now()
		inv.RevokedAt = &now
		return nil
	}
	return ErrNotFound
}

func (m *memStore) InsertAudit(_ context.Context, ev AuditEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Audits = append(m.Audits, ev)
	return nil
}

// ── projects ─────────────────────────────────────────────────────────────────

func (m *memStore) CreateProject(_ context.Context, workspaceID, name, slug string) (Project, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, p := range m.projects {
		if p.WorkspaceID == workspaceID && p.Slug == slug {
			return Project{}, ErrConflict
		}
	}
	now := time.Now()
	p := &Project{ID: m.id("prj_"), WorkspaceID: workspaceID, Name: name, Slug: slug, Status: "ACTIVE", CreatedAt: now, UpdatedAt: now}
	m.projects[p.ID] = p
	return *p, nil
}

func (m *memStore) ProjectsForWorkspace(_ context.Context, workspaceID string) ([]Project, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Project
	for _, p := range m.projects {
		if p.WorkspaceID == workspaceID {
			out = append(out, *p)
		}
	}
	return out, nil
}

func (m *memStore) Project(_ context.Context, id string) (*Project, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if p, ok := m.projects[id]; ok {
		cp := *p
		return &cp, nil
	}
	return nil, ErrNotFound
}

func (m *memStore) ArchiveProject(_ context.Context, id string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.projects[id]
	if !ok {
		return 0, ErrNotFound
	}
	// Converge rather than refuse: a project archived before binding-disable
	// existed must still be able to have its binding repaired.
	p.Status = "ARCHIVED"
	p.UpdatedAt = time.Now().UTC()
	revoked := 0
	for _, r := range m.apiKeys {
		if r.ProjectID == id && r.Status == "ACTIVE" {
			r.Status = "REVOKED"
			revoked++
		}
	}
	// Mirrors the SQL: retiring a project retires its authority. An UNSEALED
	// binding is disabled; a SEALED one is left as the immutable record it is
	// (ADR-055). A mock that skipped this would let the real behaviour regress
	// with every in-memory test still green.
	for _, b := range m.bindings {
		if b.ProjectID == id && b.State == "ACTIVE" && !b.ArtifactCreated {
			b.State = "DISABLED"
		}
	}
	return revoked, nil
}

// ── api keys ─────────────────────────────────────────────────────────────────

func (m *memStore) insertKey(in APIKeyInsert) APIKey {
	k := APIKey{
		ID: m.id("key_"), ProjectID: in.ProjectID, Environment: in.Environment, Kind: in.Kind,
		Name: in.Name, KeyPrefix: in.KeyPrefix, PublicValue: in.PublicValue, Scopes: in.Scopes,
		Status: "ACTIVE", RotatedFrom: in.RotatedFrom, CreatedAt: time.Now(),
	}
	m.apiKeys = append(m.apiKeys, &apiKeyRec{APIKey: k, keyHash: in.KeyHash})
	return k
}

func (m *memStore) CreateAPIKey(_ context.Context, in APIKeyInsert) (APIKey, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.insertKey(in), nil
}

func (m *memStore) APIKeysForProject(_ context.Context, projectID string) ([]APIKey, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []APIKey
	for _, r := range m.apiKeys {
		if r.ProjectID == projectID {
			out = append(out, r.APIKey) // metadata only; keyHash stays internal
		}
	}
	return out, nil
}

func (m *memStore) APIKeyByID(_ context.Context, id string) (*APIKey, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.apiKeys {
		if r.ID == id {
			cp := r.APIKey
			return &cp, nil
		}
	}
	return nil, ErrNotFound
}

func (m *memStore) APIKeyByHash(_ context.Context, keyHash string) (*APIKeyAuth, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.apiKeys {
		if r.keyHash == keyHash {
			return &APIKeyAuth{ID: r.ID, ProjectID: r.ProjectID, Environment: r.Environment, Status: r.Status, Scopes: r.Scopes}, nil
		}
	}
	return nil, ErrNotFound
}

func (m *memStore) TouchAPIKeyUsed(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.apiKeys {
		if r.ID == id {
			now := time.Now().UTC()
			r.LastUsedAt = &now
			return nil
		}
	}
	return ErrNotFound
}

func (m *memStore) RevokeAPIKey(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.apiKeys {
		if r.ID == id && r.Status == "ACTIVE" {
			r.Status = "REVOKED"
			return nil
		}
	}
	return ErrNotFound
}

func (m *memStore) RotateAPIKey(_ context.Context, oldID string, replacement APIKeyInsert) (APIKey, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var old *apiKeyRec
	for _, r := range m.apiKeys {
		if r.ID == oldID {
			old = r
			break
		}
	}
	if old == nil {
		return APIKey{}, ErrNotFound
	}
	nk := m.insertKey(replacement)
	old.Status = "REVOKED" // atomic in the mem model (under lock)
	return nk, nil
}

// ── project→merchant sandbox binding (ADR-047) ───────────────────────────────

func (m *memStore) CreateBinding(_ context.Context, in BindingInsert) (SandboxBinding, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, b := range m.bindings { // mirror the DB partial-unique index
		if b.ProjectID == in.ProjectID && b.State == "ACTIVE" {
			return SandboxBinding{}, ErrConflict
		}
	}
	b := &SandboxBinding{
		ID: m.id("bnd_"), ProjectID: in.ProjectID, Environment: "SANDBOX",
		MerchantID: in.MerchantID, WalletID: in.WalletID, WalletAccountID: in.WalletAccountID,
		State: "ACTIVE", ArtifactCreated: false, CreatedByUserID: in.CreatedByUserID,
		CreatedAt: time.Now(),
	}
	m.bindings = append(m.bindings, b)
	return *b, nil
}

// SupersedeAndCreateBinding mirrors the SQL: disable the unsealed ACTIVE
// binding, then insert. A sealed one is left alone and the insert then conflicts
// — the same outcome the partial unique index produces.
func (m *memStore) SupersedeAndCreateBinding(_ context.Context, in BindingInsert) (SandboxBinding, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var superseded string
	for _, b := range m.bindings {
		if b.ProjectID == in.ProjectID && b.State == "ACTIVE" && !b.ArtifactCreated {
			b.State = "DISABLED"
			superseded = b.ID
			break
		}
	}
	for _, b := range m.bindings {
		if b.ProjectID == in.ProjectID && b.State == "ACTIVE" {
			return SandboxBinding{}, "", ErrConflict
		}
	}
	b := &SandboxBinding{
		ID: m.id("bnd_"), ProjectID: in.ProjectID, Environment: "SANDBOX",
		MerchantID: in.MerchantID, WalletID: in.WalletID, WalletAccountID: in.WalletAccountID,
		State: "ACTIVE", ArtifactCreated: false, CreatedByUserID: in.CreatedByUserID,
		CreatedAt: time.Now(),
	}
	m.bindings = append(m.bindings, b)
	return *b, superseded, nil
}

func (m *memStore) ProjectsBoundToMerchant(_ context.Context, merchantID string) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []string{}
	for _, b := range m.bindings {
		if b.MerchantID == merchantID && b.State == "ACTIVE" {
			out = append(out, b.ProjectID)
		}
	}
	return out, nil
}

func (m *memStore) ActiveBindingForProject(_ context.Context, projectID string) (*SandboxBinding, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, b := range m.bindings {
		if b.ProjectID == projectID && b.State == "ACTIVE" {
			cp := *b
			return &cp, nil
		}
	}
	return nil, nil
}

func (m *memStore) MarkBindingArtifactCreated(_ context.Context, bindingID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, b := range m.bindings {
		if b.ID == bindingID {
			b.ArtifactCreated = true
			return nil
		}
	}
	return ErrNotFound
}

// ── Webhook visibility ───────────────────────────────────────────────────────
//
// The in-memory store backs local development, where the gateway's webhook
// tables do not exist. It reports nothing rather than pretending: an empty list
// is the truthful answer for a store that holds no webhook state, and inventing
// rows here is how a Console screen ends up showing fiction again.

func (m *memStore) WalletAccountsForMerchant(context.Context, string, WalletAccountFilter) ([]WalletAccountView, error) {
	return []WalletAccountView{}, nil
}

func (m *memStore) WalletAccountCountForMerchant(context.Context, string) (int, error) { return 0, nil }

func (m *memStore) TransactionsForMerchant(context.Context, string, TransactionFilter) ([]TransactionView, error) {
	return []TransactionView{}, nil
}

// WebhookEndpointsForMerchant returns what this merchant owns, newest first —
// the same scoping and ordering the SQL uses. It used to be a stub returning
// nothing, which was harmless while nothing could create an endpoint in memory
// and became a lie the moment the Console could.
func (m *memStore) WebhookEndpointsForMerchant(_ context.Context, merchantID string) ([]WebhookEndpointView, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []WebhookEndpointView{}
	for _, e := range m.webhookEndpoints {
		if e.merchantID == merchantID {
			out = append(out, e.view)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

func (m *memStore) WebhookEventsForMerchant(context.Context, string, int) ([]WebhookEventView, error) {
	return []WebhookEventView{}, nil
}

func (m *memStore) WebhookDeliveriesForEvent(context.Context, string, string) ([]WebhookDeliveryView, error) {
	return []WebhookDeliveryView{}, nil
}

// Webhook endpoint management, in memory.
//
// Real enough to exercise ownership: endpoints are keyed by merchant, and a
// rotate or a disable for a merchant that does not own the id answers not-found
// exactly as the SQL does. The secret is stored as given and never returned —
// the view type has no field for it.
func (m *memStore) CreateWebhookEndpoint(_ context.Context, merchantID, url string, events []string, storedSecret string) (*WebhookEndpointView, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.webhookEndpoints == nil {
		m.webhookEndpoints = map[string]*memWebhookEndpoint{}
	}
	id := m.id("wh_")
	m.webhookEndpoints[id] = &memWebhookEndpoint{
		merchantID: merchantID,
		secret:     storedSecret,
		view:       WebhookEndpointView{ID: id, URL: url, Events: events, Active: true, CreatedAt: time.Now().UTC()},
	}
	v := m.webhookEndpoints[id].view
	return &v, nil
}

func (m *memStore) RotateWebhookEndpointSecret(_ context.Context, merchantID, endpointID, storedSecret string) (*WebhookEndpointView, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.webhookEndpoints[endpointID]
	if !ok || e.merchantID != merchantID {
		return nil, ErrNotFound
	}
	e.secret = storedSecret
	v := e.view
	return &v, nil
}

func (m *memStore) SetWebhookEndpointActive(_ context.Context, merchantID, endpointID string, active bool) (*WebhookEndpointView, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.webhookEndpoints[endpointID]
	if !ok || e.merchantID != merchantID {
		return nil, ErrNotFound
	}
	e.view.Active = active
	v := e.view
	return &v, nil
}

// APIRequestLogs — the in-memory store keeps request logs so authority and
// filtering can be tested without a database. Rows are appended by tests via
// SeedRequestLog; the gateway is the only writer in production.
func (m *memStore) APIRequestLogs(_ context.Context, projectID string, f RequestLogFilter) ([]APIRequestLogView, error) {
	limit := f.Limit
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	out := []APIRequestLogView{}
	for _, r := range m.requestLogs {
		if r.projectID != projectID {
			continue
		}
		v := r.view
		if f.RequestID != "" && v.RequestID != f.RequestID {
			continue
		}
		if f.Status > 0 && v.Status != f.Status {
			continue
		}
		if f.Path != "" && !strings.Contains(strings.ToLower(v.Path+" "+v.Route), strings.ToLower(f.Path)) {
			continue
		}
		if f.Since != nil && v.CreatedAt.Before(*f.Since) {
			continue
		}
		if f.Until != nil && v.CreatedAt.After(*f.Until) {
			continue
		}
		out = append(out, v)
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

func (m *memStore) APIRequestLogSummary(ctx context.Context, projectID string, f RequestLogFilter) (RequestLogSummary, error) {
	var out RequestLogSummary
	since := time.Now().AddDate(0, 0, -7)
	if f.Since != nil {
		since = *f.Since
	}
	out.WindowStart = &since
	lat := []int{}
	byDay := map[string]int{}
	for _, r := range m.requestLogs {
		if r.projectID != projectID || r.view.CreatedAt.Before(since) {
			continue
		}
		out.Requests++
		if r.view.Status >= 400 {
			out.Errors++
		}
		if r.view.LatencyMS != nil {
			lat = append(lat, *r.view.LatencyMS)
		}
		byDay[r.view.CreatedAt.Format("2006-01-02")]++
	}
	if len(lat) > 0 {
		sort.Ints(lat)
		med := lat[len(lat)/2]
		out.MedianMS = &med
	}
	days := make([]string, 0, len(byDay))
	for d := range byDay {
		days = append(days, d)
	}
	sort.Strings(days)
	out.ByDay = []RequestDayCount{}
	for _, d := range days {
		out.ByDay = append(out.ByDay, RequestDayCount{Day: d, Count: byDay[d]})
	}
	return out, nil
}

// SeedRequestLog appends one row to the in-memory request log.
func (m *memStore) SeedRequestLog(projectID string, v APIRequestLogView) {
	m.requestLogs = append(m.requestLogs, memRequestLog{projectID: projectID, view: v})
}
