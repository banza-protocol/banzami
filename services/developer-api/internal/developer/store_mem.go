package developer

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"time"
)

// memStore is an in-memory Store with the same semantics as pgStore (tests /
// local dev). Concurrency-safe.
type memStore struct {
	mu         sync.Mutex
	seq        int
	workspaces map[string]*Workspace
	members    []*Member
	invites    map[string]*Invite
	inviteHash map[string]string // tokenHash -> inviteID
	projects   map[string]*Project
	apiKeys    []*apiKeyRec
	bindings   []*SandboxBinding

	Audits []AuditEvent
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
	if !ok {
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

func (m *memStore) RevokeInvite(_ context.Context, inviteID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if inv, ok := m.invites[inviteID]; ok {
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
