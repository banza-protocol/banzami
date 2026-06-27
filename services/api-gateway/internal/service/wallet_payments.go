package service

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Keyset pagination reuses encodeCursor/decodeCursor from transactions.go.

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

// WalletPaymentListItem is a row in a merchant's received-payments list.
type WalletPaymentListItem struct {
	ID          string
	AmountMinor int64
	Currency    string
	Status      string
	PayerName   string
	CreatedAt   time.Time
}

// WalletPaymentFilter are the optional list filters (all read-only).
type WalletPaymentFilter struct {
	Status   string    // optional exact status
	DateFrom time.Time // optional created_at >=
	DateTo   time.Time // optional created_at <=
	Limit    int       // 1..100
	Cursor   string    // opaque keyset cursor (created_at,id)
}

// WalletPaymentLister lists a merchant's received wallet payments (scoped).
type WalletPaymentLister interface {
	ListForMerchant(ctx context.Context, merchantID, environment string, f WalletPaymentFilter) (items []WalletPaymentListItem, nextCursor string, err error)
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

// ListForMerchant returns the merchant's received wallet payments, newest first,
// scoped to merchant + environment, with keyset pagination. Read-only.
func (s *PostgresWalletPaymentService) ListForMerchant(ctx context.Context, merchantID, environment string, f WalletPaymentFilter) ([]WalletPaymentListItem, string, error) {
	limit := f.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	where := []string{"wp.merchant_id::text = $1", "wp.environment = $2"}
	args := []any{merchantID, environment}
	add := func(clause string, val any) {
		args = append(args, val)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	if f.Status != "" {
		add("wp.status = $%d", f.Status)
	}
	if !f.DateFrom.IsZero() {
		add("wp.created_at >= $%d", f.DateFrom)
	}
	if !f.DateTo.IsZero() {
		add("wp.created_at <= $%d", f.DateTo)
	}
	if f.Cursor != "" {
		if ct, cid, err := decodeCursor(f.Cursor); err == nil {
			args = append(args, ct, cid)
			where = append(where, fmt.Sprintf("(wp.created_at < $%d OR (wp.created_at = $%d AND wp.id::text < $%d))", len(args)-1, len(args)-1, len(args)))
		}
	}

	q := `SELECT wp.id::text, wp.amount_minor, wp.currency, wp.status, wp.created_at,
		COALESCE(c.display_name, CASE WHEN c.handle IS NOT NULL THEN '@'||c.handle ELSE '' END, '')
		FROM wallet_payments wp
		LEFT JOIN consumers c ON c.id = wp.consumer_id
		WHERE ` + strings.Join(where, " AND ") + `
		ORDER BY wp.created_at DESC, wp.id DESC
		LIMIT ` + strconv.Itoa(limit+1)

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	items := make([]WalletPaymentListItem, 0, limit+1)
	for rows.Next() {
		var it WalletPaymentListItem
		if err := rows.Scan(&it.ID, &it.AmountMinor, &it.Currency, &it.Status, &it.CreatedAt, &it.PayerName); err != nil {
			return nil, "", err
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	next := ""
	if len(items) > limit {
		last := items[limit-1]
		next = encodeCursor(last.CreatedAt, last.ID)
		items = items[:limit]
	}
	return items, next, nil
}
