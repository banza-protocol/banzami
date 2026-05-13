package service

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

var ErrMerchantNotFound = errors.New("merchant not found")
var ErrApiKeyNotFound   = errors.New("API key not found")
var ErrDuplicateEmail   = errors.New("email already registered")
var ErrMerchantInactive = errors.New("merchant is not active")
var ErrKeyRevoked       = errors.New("API key has been revoked")
var ErrInvalidApiKey    = errors.New("invalid API key")

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type MerchantStatus string

const (
	MerchantStatusActive    MerchantStatus = "ACTIVE"
	MerchantStatusSuspended MerchantStatus = "SUSPENDED"
	MerchantStatusClosed    MerchantStatus = "CLOSED"
)

type MerchantRecord struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Email     string         `json:"email"`
	Status    MerchantStatus `json:"status"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
}

type ApiKeyRecord struct {
	ID          string    `json:"id"`
	MerchantID  string    `json:"merchant_id"`
	Name        string    `json:"name"`
	KeyPrefix   string    `json:"key_prefix"`
	CreatedAt   time.Time `json:"created_at"`
	LastUsedAt  *time.Time `json:"last_used_at,omitempty"`
	RevokedAt   *time.Time `json:"revoked_at,omitempty"`
}

// ApiKeyWithSecret is returned only at key creation; the secret cannot be recovered later.
type ApiKeyWithSecret struct {
	ApiKeyRecord
	Secret string `json:"secret"`
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

type CreateMerchantRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

type MerchantService interface {
	Create(ctx context.Context, req CreateMerchantRequest) (*MerchantRecord, error)
	Get(ctx context.Context, id string) (*MerchantRecord, error)
	Suspend(ctx context.Context, id string) (*MerchantRecord, error)

	// CreateApiKey issues a new key. The raw secret in ApiKeyWithSecret is shown once.
	CreateApiKey(ctx context.Context, merchantID, name string) (*ApiKeyWithSecret, error)
	ListApiKeys(ctx context.Context, merchantID string) ([]*ApiKeyRecord, error)
	RevokeApiKey(ctx context.Context, merchantID, keyID string) error
}

// ---------------------------------------------------------------------------
// Stub implementation (in-memory — replaced when Rust core is bridged)
// ---------------------------------------------------------------------------

type StubMerchantService struct {
	mu       sync.RWMutex
	merchants map[string]*MerchantRecord
	apiKeys   map[string]*apiKeyInternal // keyed by id
}

// apiKeyInternal holds the hash alongside the public record for verification.
type apiKeyInternal struct {
	record  ApiKeyRecord
	keyHash string
}

func NewStubMerchantService() *StubMerchantService {
	return &StubMerchantService{
		merchants: make(map[string]*MerchantRecord),
		apiKeys:   make(map[string]*apiKeyInternal),
	}
}

func (s *StubMerchantService) Create(_ context.Context, req CreateMerchantRequest) (*MerchantRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, m := range s.merchants {
		if m.Email == req.Email {
			return nil, ErrDuplicateEmail
		}
	}

	now := time.Now().UTC()
	m := &MerchantRecord{
		ID:        uuid.NewString(),
		Name:      req.Name,
		Email:     req.Email,
		Status:    MerchantStatusActive,
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.merchants[m.ID] = m
	return m, nil
}

func (s *StubMerchantService) Get(_ context.Context, id string) (*MerchantRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	m, ok := s.merchants[id]
	if !ok {
		return nil, ErrMerchantNotFound
	}
	cp := *m
	return &cp, nil
}

func (s *StubMerchantService) Suspend(_ context.Context, id string) (*MerchantRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	m, ok := s.merchants[id]
	if !ok {
		return nil, ErrMerchantNotFound
	}
	m.Status    = MerchantStatusSuspended
	m.UpdatedAt = time.Now().UTC()
	cp := *m
	return &cp, nil
}

func (s *StubMerchantService) CreateApiKey(_ context.Context, merchantID, name string) (*ApiKeyWithSecret, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	m, ok := s.merchants[merchantID]
	if !ok {
		return nil, ErrMerchantNotFound
	}
	if m.Status != MerchantStatusActive {
		return nil, ErrMerchantInactive
	}

	// Generate: bz_live_<uuid1><uuid2> — 256 bits of entropy from OS CSPRNG.
	a := uuid.NewString()
	b := uuid.NewString()
	raw    := fmt.Sprintf("bz_live_%s%s", removeHyphens(a), removeHyphens(b))
	prefix := raw[8:16]
	hash   := hashKey(raw)

	rec := ApiKeyRecord{
		ID:         uuid.NewString(),
		MerchantID: merchantID,
		Name:       name,
		KeyPrefix:  prefix,
		CreatedAt:  time.Now().UTC(),
	}
	s.apiKeys[rec.ID] = &apiKeyInternal{record: rec, keyHash: hash}

	return &ApiKeyWithSecret{ApiKeyRecord: rec, Secret: raw}, nil
}

func (s *StubMerchantService) ListApiKeys(_ context.Context, merchantID string) ([]*ApiKeyRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var keys []*ApiKeyRecord
	for _, k := range s.apiKeys {
		if k.record.MerchantID == merchantID {
			cp := k.record
			keys = append(keys, &cp)
		}
	}
	return keys, nil
}

func (s *StubMerchantService) RevokeApiKey(_ context.Context, merchantID, keyID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	k, ok := s.apiKeys[keyID]
	if !ok || k.record.MerchantID != merchantID {
		return ErrApiKeyNotFound
	}
	if k.record.RevokedAt != nil {
		return nil // already revoked — idempotent
	}
	now := time.Now().UTC()
	k.record.RevokedAt = &now
	return nil
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func removeHyphens(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] != '-' {
			out = append(out, s[i])
		}
	}
	return string(out)
}

func hashKey(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", h)
}
