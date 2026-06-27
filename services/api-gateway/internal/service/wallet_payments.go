package service

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrWalletPaymentNotFound is returned when no wallet payment matches.
var ErrWalletPaymentNotFound = errors.New("wallet payment not found")

// WalletPayment is a read-only view of a wallet-native merchant payment
// (canonical source: wallet_payments, written by core on merchant QR/payment
// settlement). Used to generate official merchant receipts. Read-only — this
// service never writes.
type WalletPayment struct {
	ID          string
	TransferID  string
	MerchantID  string
	ConsumerID  string
	AmountMinor int64
	Currency    string
	Status      string
	Environment string
	CreatedAt   time.Time
}

// WalletPaymentReader reads wallet payments by id (or settling transfer id).
type WalletPaymentReader interface {
	GetByID(ctx context.Context, id string) (*WalletPayment, error)
}

// PostgresWalletPaymentService reads wallet_payments from Postgres.
type PostgresWalletPaymentService struct {
	pool *pgxpool.Pool
}

func NewPostgresWalletPaymentService(pool *pgxpool.Pool) *PostgresWalletPaymentService {
	return &PostgresWalletPaymentService{pool: pool}
}

// GetByID matches on the wallet-payment id OR its settling transfer id (the
// merchant app may hold either). Read-only.
func (s *PostgresWalletPaymentService) GetByID(ctx context.Context, id string) (*WalletPayment, error) {
	const q = `
		SELECT id::text, transfer_id::text, merchant_id::text, consumer_id::text,
		       amount_minor, currency, status, environment, created_at
		  FROM wallet_payments
		 WHERE id::text = $1 OR transfer_id::text = $1
		 LIMIT 1`
	var wp WalletPayment
	err := s.pool.QueryRow(ctx, q, id).Scan(
		&wp.ID, &wp.TransferID, &wp.MerchantID, &wp.ConsumerID,
		&wp.AmountMinor, &wp.Currency, &wp.Status, &wp.Environment, &wp.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrWalletPaymentNotFound
		}
		return nil, err
	}
	return &wp, nil
}
