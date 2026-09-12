package accountidentity

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"time"
)

// memStore is an in-memory Store with the same semantics as pgStore. Used by
// tests and local runs without a database. Concurrency-safe.
type memStore struct {
	mu       sync.Mutex
	otps     []*otpRec
	users    map[string]*User // keyed by canonical (lower) email
	sessions map[string]*sessRec
	seq      int

	// Audits is exposed for test assertions.
	Audits []AuditEvent
}

type otpRec struct {
	email       string
	purpose     string
	codeHash    string
	expiresAt   time.Time
	attempts    int
	maxAttempts int
	consumed    bool
	createdAt   time.Time
}

type sessRec struct {
	id        string
	userID    string
	tokenHash string
	expiresAt time.Time
	revoked   bool
}

// NewMemStore builds an in-memory Store.
func NewMemStore() *memStore {
	return &memStore{users: map[string]*User{}, sessions: map[string]*sessRec{}}
}

func (m *memStore) nextID(prefix string) string {
	m.seq++
	return prefix + strconv.Itoa(m.seq)
}

func (m *memStore) IssueOTP(_ context.Context, in OTPInsert) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := strings.ToLower(in.Email)
	for _, o := range m.otps {
		if o.email == key && o.purpose == in.Purpose && !o.consumed {
			o.consumed = true // invalidate prior active
		}
	}
	m.otps = append(m.otps, &otpRec{
		email: key, purpose: in.Purpose, codeHash: in.CodeHash,
		expiresAt: in.ExpiresAt, maxAttempts: 5, createdAt: time.Now(),
	})
	return nil
}

func (m *memStore) VerifyOTP(_ context.Context, email, purpose, code, pepper string) (OTPResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := strings.ToLower(email)
	var rec *otpRec
	for i := len(m.otps) - 1; i >= 0; i-- {
		o := m.otps[i]
		if o.email == key && o.purpose == purpose && !o.consumed {
			rec = o
			break
		}
	}
	if rec == nil {
		return OTPNoActive, nil
	}
	if time.Now().After(rec.expiresAt) {
		return OTPExpired, nil
	}
	if rec.attempts >= rec.maxAttempts {
		return OTPTooManyAttempts, nil
	}
	if otpMatches(code, rec.codeHash, pepper) {
		rec.consumed = true
		return OTPOK, nil
	}
	rec.attempts++
	return OTPInvalid, nil
}

func (m *memStore) UpsertVerifiedUser(_ context.Context, email string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := strings.ToLower(email)
	if u, ok := m.users[key]; ok {
		u.Verified = true
		u.UpdatedAt = time.Now()
		return *u, nil
	}
	now := time.Now()
	u := &User{ID: m.nextID("usr_"), Email: key, Verified: true, Status: "ACTIVE", CreatedAt: now, UpdatedAt: now}
	m.users[key] = u
	return *u, nil
}

func (m *memStore) UserByID(_ context.Context, id string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if u.ID == id {
			return *u, nil
		}
	}
	return User{}, ErrNotFound
}

func (m *memStore) SetUserName(_ context.Context, id, name string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if u.ID == id {
			u.Name = name
			return *u, nil
		}
	}
	return User{}, ErrNotFound
}

func (m *memStore) CreateSession(_ context.Context, in SessionInsert) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[in.TokenHash] = &sessRec{
		id: m.nextID("ses_"), userID: in.UserID, tokenHash: in.TokenHash, expiresAt: in.ExpiresAt,
	}
	return nil
}

func (m *memStore) LiveSessionByHash(_ context.Context, tokenHash string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.sessions[tokenHash]
	if !ok || r.revoked || time.Now().After(r.expiresAt) {
		return nil, ErrNotFound
	}
	return &Session{ID: r.id, UserID: r.userID, ExpiresAt: r.expiresAt}, nil
}

func (m *memStore) LiveSessions(_ context.Context, userID string) ([]SessionView, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []SessionView{}
	for _, r := range m.sessions {
		if r.userID != userID || r.revoked || r.expiresAt.Before(time.Now()) {
			continue
		}
		out = append(out, SessionView{ID: r.id, ExpiresAt: r.expiresAt})
	}
	return out, nil
}

func (m *memStore) RevokeOtherSessions(_ context.Context, userID, keepSessionID string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, r := range m.sessions {
		if r.userID == userID && r.id != keepSessionID && !r.revoked {
			r.revoked = true
			n++
		}
	}
	return n, nil
}

func (m *memStore) TouchSession(_ context.Context, _ string) error { return nil }

func (m *memStore) RevokeSessionByHash(_ context.Context, tokenHash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if r, ok := m.sessions[tokenHash]; ok {
		r.revoked = true
	}
	return nil
}

func (m *memStore) InsertAudit(_ context.Context, ev AuditEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Audits = append(m.Audits, ev)
	return nil
}

// userByEmail is a test helper.
func (m *memStore) userByEmail(email string) (*User, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[strings.ToLower(email)]
	return u, ok
}
