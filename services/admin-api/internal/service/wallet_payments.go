package service

import (
	"context"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AdminWalletPaymentItem is a row in the admin received-payments list.
type AdminWalletPaymentItem struct {
	ID           string
	MerchantID   string
	MerchantName string
	PayerName    string
	AmountMinor  int64
	Currency     string
	Status       string
	Environment  string
	CreatedAt    time.Time
}

// AdminWalletPaymentFilter are the optional admin list filters (read-only).
type AdminWalletPaymentFilter struct {
	MerchantID  string
	Status      string
	Environment string
	DateFrom    time.Time
	DateTo      time.Time
	Limit       int
	Cursor      string
}

// AdminWalletPaymentLister lists wallet payments across merchants (admin scope).
type AdminWalletPaymentLister interface {
	List(ctx context.Context, f AdminWalletPaymentFilter) (items []AdminWalletPaymentItem, nextCursor string, err error)
}

// PostgresWalletPaymentService reads wallet_payments (admin, read-only).
type PostgresWalletPaymentService struct {
	pool *pgxpool.Pool
}

func NewPostgresWalletPaymentService(pool *pgxpool.Pool) *PostgresWalletPaymentService {
	return &PostgresWalletPaymentService{pool: pool}
}

func walletEncodeCursor(t time.Time, id string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strconv.FormatInt(t.UnixNano(), 10) + "|" + id))
}

func walletDecodeCursor(c string) (time.Time, string, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(c)
	if err != nil {
		return time.Time{}, "", false
	}
	parts := strings.SplitN(string(raw), "|", 2)
	if len(parts) != 2 {
		return time.Time{}, "", false
	}
	ns, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return time.Time{}, "", false
	}
	return time.Unix(0, ns).UTC(), parts[1], true
}

// List returns wallet payments newest first, with optional filters + keyset
// pagination. Read-only.
func (s *PostgresWalletPaymentService) List(ctx context.Context, f AdminWalletPaymentFilter) ([]AdminWalletPaymentItem, string, error) {
	limit := f.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	where := []string{"1=1"}
	args := []any{}
	add := func(clause string, val any) {
		args = append(args, val)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	if f.MerchantID != "" {
		add("wp.merchant_id::text = $%d", f.MerchantID)
	}
	if f.Status != "" {
		add("wp.status = $%d", f.Status)
	}
	if f.Environment != "" {
		add("wp.environment = $%d", f.Environment)
	}
	if !f.DateFrom.IsZero() {
		add("wp.created_at >= $%d", f.DateFrom)
	}
	if !f.DateTo.IsZero() {
		add("wp.created_at <= $%d", f.DateTo)
	}
	if f.Cursor != "" {
		if ct, cid, ok := walletDecodeCursor(f.Cursor); ok {
			args = append(args, ct, cid)
			where = append(where, fmt.Sprintf("(wp.created_at < $%d OR (wp.created_at = $%d AND wp.id::text < $%d))", len(args)-1, len(args)-1, len(args)))
		}
	}

	q := `SELECT wp.id::text, wp.merchant_id::text, COALESCE(m.name,''),
		COALESCE(c.display_name, CASE WHEN c.handle IS NOT NULL THEN '@'||c.handle ELSE '' END, ''),
		wp.amount_minor, wp.currency, wp.status, wp.environment, wp.created_at
		FROM wallet_payments wp
		LEFT JOIN merchants m ON m.id = wp.merchant_id
		LEFT JOIN consumers c ON c.id = wp.consumer_id
		WHERE ` + strings.Join(where, " AND ") + `
		ORDER BY wp.created_at DESC, wp.id DESC
		LIMIT ` + strconv.Itoa(limit+1)

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	items := make([]AdminWalletPaymentItem, 0, limit+1)
	for rows.Next() {
		var it AdminWalletPaymentItem
		if err := rows.Scan(&it.ID, &it.MerchantID, &it.MerchantName, &it.PayerName,
			&it.AmountMinor, &it.Currency, &it.Status, &it.Environment, &it.CreatedAt); err != nil {
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
		next = walletEncodeCursor(last.CreatedAt, last.ID)
		items = items[:limit]
	}
	return items, next, nil
}
