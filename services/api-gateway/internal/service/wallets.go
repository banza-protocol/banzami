package service

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
)

var ErrWalletNotFound = errors.New("wallet not found")
var ErrDuplicateWallet = errors.New("wallet already exists for this merchant and currency")
var ErrUnsupportedCurrency = errors.New("unsupported currency")

// Currencies accepted on the platform.
var supportedCurrencies = map[string]bool{
	"AOA": true,
	"USD": true,
	"EUR": true,
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type WalletRecord struct {
	ID         string    `json:"id"`
	MerchantID string    `json:"merchant_id"`
	Currency   string    `json:"currency"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
}

type WalletBalance struct {
	WalletID       string    `json:"wallet_id"`
	Currency       string    `json:"currency"`
	AvailableMinor int64     `json:"available_minor"`
	ReservedMinor  int64     `json:"reserved_minor"`
	TotalMinor     int64     `json:"total_minor"`
	ComputedAt     time.Time `json:"computed_at"`
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

type WalletService interface {
	Create(ctx context.Context, merchantID, currency string) (*WalletRecord, error)
	Get(ctx context.Context, id string) (*WalletRecord, error)
	Balance(ctx context.Context, id string) (*WalletBalance, error)
	GetForMerchant(ctx context.Context, merchantID, currency string) (*WalletRecord, error)
	// SandboxFund credits a sandbox wallet's available balance directly via the
	// ledger engine. Only callable in SANDBOX environments — enforced by callers.
	SandboxFund(ctx context.Context, walletID string, amountMinor int64, currency string) (*WalletBalance, error)
	// Analytics returns merchant payment-volume analytics (raw JSON passthrough
	// from the core), aggregated from the ledger. from/to are optional RFC3339.
	Analytics(ctx context.Context, walletID, from, to string) (json.RawMessage, error)
}

// ---------------------------------------------------------------------------
// Stub implementation
// ---------------------------------------------------------------------------

type StubWalletService struct {
	mu             sync.RWMutex
	wallets        map[string]*WalletRecord // keyed by id
	sandboxCredits map[string]int64         // cumulative sandbox credits keyed by wallet id
}

func NewStubWalletService() *StubWalletService {
	return &StubWalletService{
		wallets: make(map[string]*WalletRecord),
	}
}

func (s *StubWalletService) Create(_ context.Context, merchantID, currency string) (*WalletRecord, error) {
	if !supportedCurrencies[currency] {
		return nil, ErrUnsupportedCurrency
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, w := range s.wallets {
		if w.MerchantID == merchantID && w.Currency == currency {
			return nil, ErrDuplicateWallet
		}
	}

	w := &WalletRecord{
		ID:         uuid.NewString(),
		MerchantID: merchantID,
		Currency:   currency,
		Status:     "ACTIVE",
		CreatedAt:  time.Now().UTC(),
	}
	s.wallets[w.ID] = w
	return w, nil
}

func (s *StubWalletService) Get(_ context.Context, id string) (*WalletRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	w, ok := s.wallets[id]
	if !ok {
		return nil, ErrWalletNotFound
	}
	cp := *w
	return &cp, nil
}

func (s *StubWalletService) Balance(_ context.Context, id string) (*WalletBalance, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	w, ok := s.wallets[id]
	if !ok {
		return nil, ErrWalletNotFound
	}
	// Stub returns zero balances — real implementation queries the ledger.
	return &WalletBalance{
		WalletID:       w.ID,
		Currency:       w.Currency,
		AvailableMinor: 0,
		ReservedMinor:  0,
		TotalMinor:     0,
		ComputedAt:     time.Now().UTC(),
	}, nil
}

func (s *StubWalletService) GetForMerchant(_ context.Context, merchantID, currency string) (*WalletRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, w := range s.wallets {
		if w.MerchantID == merchantID && w.Currency == currency {
			cp := *w
			return &cp, nil
		}
	}
	return nil, ErrWalletNotFound
}

func (s *StubWalletService) SandboxFund(_ context.Context, walletID string, amountMinor int64, currency string) (*WalletBalance, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	w, ok := s.wallets[walletID]
	if !ok {
		return nil, ErrWalletNotFound
	}
	if currency == "" {
		currency = "AOA"
	}
	// Stub: track the credited amount so Balance() reflects it.
	if s.sandboxCredits == nil {
		s.sandboxCredits = make(map[string]int64)
	}
	s.sandboxCredits[walletID] += amountMinor
	total := s.sandboxCredits[walletID]

	return &WalletBalance{
		WalletID:       w.ID,
		Currency:       currency,
		AvailableMinor: total,
		ReservedMinor:  0,
		TotalMinor:     total,
		ComputedAt:     time.Now().UTC(),
	}, nil
}

func (s *StubWalletService) Analytics(_ context.Context, walletID, _, _ string) (json.RawMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.wallets[walletID]; !ok {
		return nil, ErrWalletNotFound
	}
	// Stub returns an empty-but-valid analytics envelope.
	return json.RawMessage(`{"wallet_id":"` + walletID +
		`","currency":"AOA","total_volume_minor":0,"total_count":0,"active_days":0,"daily":[],"by_hour":[]}`), nil
}
