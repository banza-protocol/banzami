package service

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
)

var (
	ErrPayoutNotFound          = errors.New("payout not found")
	ErrPayoutInsufficientFunds = errors.New("insufficient funds for payout")
)

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type PayoutStatus string

const (
	PayoutStatusPending    PayoutStatus = "PENDING"
	PayoutStatusProcessing PayoutStatus = "PROCESSING"
	PayoutStatusSent       PayoutStatus = "SENT"
	PayoutStatusConfirmed  PayoutStatus = "CONFIRMED"
	PayoutStatusFailed     PayoutStatus = "FAILED"
	PayoutStatusReturned   PayoutStatus = "RETURNED"
)

type BankDestination struct {
	AccountNumber     string `json:"account_number"`
	BankCode          string `json:"bank_code"`
	AccountHolderName string `json:"account_holder_name"`
}

type Payout struct {
	ID              string          `json:"id"`
	MerchantID      string          `json:"merchant_id"`
	WalletID        string          `json:"wallet_id"`
	IdempotencyKey  string          `json:"idempotency_key"`
	Status          PayoutStatus    `json:"status"`
	AmountMinor     int64           `json:"amount_minor"`
	Currency        string          `json:"currency"`
	Destination     BankDestination `json:"destination"`
	LedgerPostingID *string         `json:"ledger_posting_id,omitempty"`
	FailureReason   *string         `json:"failure_reason,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	SentAt          *time.Time      `json:"sent_at,omitempty"`
	ConfirmedAt     *time.Time      `json:"confirmed_at,omitempty"`
	ReturnedAt      *time.Time      `json:"returned_at,omitempty"`
	FailedAt        *time.Time      `json:"failed_at,omitempty"`
}

type CreatePayoutRequest struct {
	IdempotencyKey    string
	MerchantID        string
	WalletID          string
	AmountMinor       int64
	Currency          string
	BankAccountNumber string
	BankCode          string
	AccountHolderName string
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

type PayoutService interface {
	Create(ctx context.Context, req CreatePayoutRequest) (*Payout, error)
	Get(ctx context.Context, merchantID, id string) (*Payout, error)
	List(ctx context.Context, merchantID string, limit int) ([]*Payout, error)
}

// ---------------------------------------------------------------------------
// In-memory stub — replaced by CoreApiPayoutService in production
// ---------------------------------------------------------------------------

type StubPayoutService struct {
	mu      sync.RWMutex
	payouts []*Payout
}

func NewStubPayoutService() *StubPayoutService {
	return &StubPayoutService{}
}

func (s *StubPayoutService) Create(_ context.Context, req CreatePayoutRequest) (*Payout, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Idempotency check.
	for _, p := range s.payouts {
		if p.IdempotencyKey == req.IdempotencyKey {
			return p, nil
		}
	}

	p := &Payout{
		ID:             uuid.NewString(),
		MerchantID:     req.MerchantID,
		WalletID:       req.WalletID,
		IdempotencyKey: req.IdempotencyKey,
		Status:         PayoutStatusPending,
		AmountMinor:    req.AmountMinor,
		Currency:       req.Currency,
		Destination: BankDestination{
			AccountNumber:     req.BankAccountNumber,
			BankCode:          req.BankCode,
			AccountHolderName: req.AccountHolderName,
		},
		CreatedAt: time.Now().UTC(),
	}
	s.payouts = append(s.payouts, p)
	return p, nil
}

func (s *StubPayoutService) Get(_ context.Context, merchantID, id string) (*Payout, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.payouts {
		if p.ID == id && p.MerchantID == merchantID {
			cp := *p
			return &cp, nil
		}
	}
	return nil, ErrPayoutNotFound
}

func (s *StubPayoutService) List(_ context.Context, merchantID string, limit int) ([]*Payout, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*Payout
	for i := len(s.payouts) - 1; i >= 0 && len(out) < limit; i-- {
		if s.payouts[i].MerchantID == merchantID {
			cp := *s.payouts[i]
			out = append(out, &cp)
		}
	}
	return out, nil
}
