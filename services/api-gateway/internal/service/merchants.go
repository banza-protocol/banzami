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
var ErrApiKeyNotFound = errors.New("API key not found")
var ErrDuplicateEmail = errors.New("email already registered")
var ErrMerchantInactive = errors.New("merchant is not active")
var ErrKeyRevoked = errors.New("API key has been revoked")
var ErrInvalidApiKey = errors.New("invalid API key")

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type MerchantStatus string

const (
	MerchantStatusActive    MerchantStatus = "ACTIVE"
	MerchantStatusSuspended MerchantStatus = "SUSPENDED"
	MerchantStatusClosed    MerchantStatus = "CLOSED"
)

// ApiKeyEnvironment identifies whether an API key grants access to the live
// payment system or to the fully-isolated sandbox.
// LIVE keys carry the prefix "bz_live_"; SANDBOX keys carry "bz_test_".
// These two environments MUST NEVER share financial data.
type ApiKeyEnvironment string

const (
	ApiKeyEnvironmentLive    ApiKeyEnvironment = "LIVE"
	ApiKeyEnvironmentSandbox ApiKeyEnvironment = "SANDBOX"
)

// keySecretPrefix returns the secret prefix for the given environment.
// The prefix is part of the raw key and therefore cryptographically bound to it.
func (e ApiKeyEnvironment) keySecretPrefix() string {
	if e == ApiKeyEnvironmentSandbox {
		return "bz_test_"
	}
	return "bz_live_"
}

type MerchantRecord struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Email    string         `json:"email"`
	Status   MerchantStatus `json:"status"`
	Verified bool           `json:"verified"`
	// BusinessAccountType is the ADR-028 operator taxonomy (MERCHANT default).
	BusinessAccountType string    `json:"business_account_type"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type ApiKeyRecord struct {
	ID          string            `json:"id"`
	MerchantID  string            `json:"merchant_id"`
	Name        string            `json:"name"`
	KeyPrefix   string            `json:"key_prefix"`
	Environment ApiKeyEnvironment `json:"environment"`
	CreatedAt   time.Time         `json:"created_at"`
	LastUsedAt  *time.Time        `json:"last_used_at,omitempty"`
	RevokedAt   *time.Time        `json:"revoked_at,omitempty"`
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

	// CreateApiKey issues a new API key for the given environment.
	// The raw secret in ApiKeyWithSecret is shown once and cannot be recovered.
	CreateApiKey(ctx context.Context, merchantID, name string, env ApiKeyEnvironment) (*ApiKeyWithSecret, error)
	ListApiKeys(ctx context.Context, merchantID string) ([]*ApiKeyRecord, error)
	RevokeApiKey(ctx context.Context, merchantID, keyID string) error

	// VerifyApiKey validates a raw API key and returns the owning merchant plus
	// the environment the key grants access to.
	// Returns ErrInvalidApiKey for unknown keys and ErrKeyRevoked for revoked ones.
	VerifyApiKey(ctx context.Context, rawKey string) (*MerchantRecord, ApiKeyEnvironment, error)
}

// ---------------------------------------------------------------------------
// Stub implementation (in-memory — replaced when Rust core is bridged)
// ---------------------------------------------------------------------------

type StubMerchantService struct {
	mu        sync.RWMutex
	merchants map[string]*MerchantRecord
	apiKeys   map[string]*apiKeyInternal // keyed by id
}

// apiKeyInternal holds the hash and environment alongside the public record.
type apiKeyInternal struct {
	record      ApiKeyRecord
	keyHash     string
	environment ApiKeyEnvironment
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
	m.Status = MerchantStatusSuspended
	m.UpdatedAt = time.Now().UTC()
	cp := *m
	return &cp, nil
}

func (s *StubMerchantService) CreateApiKey(_ context.Context, merchantID, name string, env ApiKeyEnvironment) (*ApiKeyWithSecret, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	m, ok := s.merchants[merchantID]
	if !ok {
		return nil, ErrMerchantNotFound
	}
	if m.Status != MerchantStatusActive {
		return nil, ErrMerchantInactive
	}

	// Generate: <prefix><uuid1><uuid2> — 256 bits of entropy from OS CSPRNG.
	// The prefix ("bz_live_" or "bz_test_") is part of the raw key and is
	// therefore cryptographically bound to the environment.
	a := uuid.NewString()
	b := uuid.NewString()
	raw := fmt.Sprintf("%s%s%s", env.keySecretPrefix(), removeHyphens(a), removeHyphens(b))
	prefix := raw[len(env.keySecretPrefix()) : len(env.keySecretPrefix())+8]
	hash := hashKey(raw)

	rec := ApiKeyRecord{
		ID:          uuid.NewString(),
		MerchantID:  merchantID,
		Name:        name,
		KeyPrefix:   prefix,
		Environment: env,
		CreatedAt:   time.Now().UTC(),
	}
	s.apiKeys[rec.ID] = &apiKeyInternal{record: rec, keyHash: hash, environment: env}

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

func (s *StubMerchantService) VerifyApiKey(_ context.Context, rawKey string) (*MerchantRecord, ApiKeyEnvironment, error) {
	h := hashKey(rawKey)

	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, k := range s.apiKeys {
		if k.keyHash == h {
			if k.record.RevokedAt != nil {
				return nil, "", ErrKeyRevoked
			}
			m, ok := s.merchants[k.record.MerchantID]
			if !ok {
				return nil, "", ErrMerchantNotFound
			}
			cp := *m
			return &cp, k.environment, nil
		}
	}
	return nil, "", ErrInvalidApiKey
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
