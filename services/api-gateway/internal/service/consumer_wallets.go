package service

import (
	"context"
	"errors"
	"time"
)

var ErrConsumerWalletNotFound    = errors.New("consumer wallet not found")
var ErrNoWalletForConsumer       = errors.New("no wallet for consumer in that currency")

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type ConsumerWalletRecord struct {
	ID                 string    `json:"id"`
	ConsumerID         string    `json:"consumer_id"`
	Currency           string    `json:"currency"`
	Status             string    `json:"status"`
	AvailableAccountID string    `json:"available_account_id"`
	ReservedAccountID  string    `json:"reserved_account_id"`
	CreatedAt          time.Time `json:"created_at"`
}

type ConsumerWalletBalance struct {
	WalletID       string    `json:"wallet_id"`
	ConsumerID     string    `json:"consumer_id"`
	Currency       string    `json:"currency"`
	AvailableMinor int64     `json:"available_minor"`
	ReservedMinor  int64     `json:"reserved_minor"`
	TotalMinor     int64     `json:"total_minor"`
	ComputedAt     time.Time `json:"computed_at"`
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

type ConsumerWalletService interface {
	GetOrCreate(ctx context.Context, consumerID, currency string) (*ConsumerWalletRecord, error)
	Get(ctx context.Context, id string) (*ConsumerWalletRecord, error)
	Balance(ctx context.Context, id string) (*ConsumerWalletBalance, error)
	GetForConsumer(ctx context.Context, consumerID, currency string) (*ConsumerWalletRecord, error)
}
