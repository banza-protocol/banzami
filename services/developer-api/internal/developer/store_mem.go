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

	Audits []AuditEvent
}

// NewMemStore builds an in-memory developer Store.
func NewMemStore() *memStore {
	return &memStore{
		workspaces: map[string]*Workspace{},
		invites:    map[string]*Invite{},
		inviteHash: map[string]string{},
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
