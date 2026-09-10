package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	documents "github.com/banzami/banzami/services/common/documents"
)

// ErrReceiptNotFound is returned when no transaction matches the id.
var ErrReceiptNotFound = errors.New("receipt not found")

// ReceiptSource loads a transaction (merchant payment or P2P transfer) and maps
// it to official ReceiptData. Read-only — never writes.
type ReceiptSource interface {
	LoadReceipt(ctx context.Context, id string) (documents.ReceiptData, error)
}

// PostgresReceiptSource reads the canonical sources (wallet_payments, transfers)
// plus identity (consumers, merchants) directly from Postgres. Read-only.
type PostgresReceiptSource struct {
	pool *pgxpool.Pool
}

func NewPostgresReceiptSource(pool *pgxpool.Pool) *PostgresReceiptSource {
	return &PostgresReceiptSource{pool: pool}
}

// existingProofReference returns the public proof reference for a transaction, or
// "" when none exists.
//
// It does NOT derive one. This used to compute BZM-XXXX-XXXX from the object id
// and print it as a verification URL, which meant an operator-issued receipt
// advertised a page that had never been backed by a proof and answered "does not
// exist or may have been forged". Nor does it MINT one: proofs are established
// when the payer or merchant issues a receipt, and an operator viewing a document
// is not that event — creating public proof capability as a side effect of an
// internal read would be worse than the missing line.
//
// With no proof, the receipt simply renders no verification block.
func (s *PostgresReceiptSource) existingProofReference(ctx context.Context, txnID, environment string) string {
	env := strings.TrimSpace(environment)
	if env == "" {
		env = "LIVE"
	}
	var ref string
	if err := s.pool.QueryRow(ctx,
		`SELECT proof_reference FROM transaction_proofs WHERE transaction_id=$1 AND environment=$2`,
		txnID, env).Scan(&ref); err != nil {
		return ""
	}
	return ref
}

// LoadReceipt resolves a merchant payment first (wallet_payments), then a P2P
// transfer, and builds the matching official receipt.
func (s *PostgresReceiptSource) LoadReceipt(ctx context.Context, id string) (documents.ReceiptData, error) {
	if wp, ok, err := s.walletPayment(ctx, id); err != nil {
		return documents.ReceiptData{}, err
	} else if ok {
		payerName, payerHandle := s.consumer(ctx, wp.consumerID)
		merchantName := s.merchant(ctx, wp.merchantID)
		ref := s.existingProofReference(ctx, wp.id, wp.environment)
		return documents.ReceiptData{
			ReceiptID: wp.id, TransactionID: wp.id, Reference: ref,
			Perspective: documents.PerspectiveMerchant,
			AmountMinor: wp.amountMinor, Currency: wp.currency, Status: wp.status,
			CreatedAt: wp.createdAt, CompletedAt: wp.createdAt, IssuedAt: wp.createdAt,
			PayerName: payerName, PayerHandle: payerHandle, MerchantName: merchantName,
			PaymentMethod: "Pagamento por QR · @banza", Environment: wp.environment,
			VerificationReference: verificationRefOrEmpty(ref),
		}, nil
	}

	if tf, ok, err := s.transfer(ctx, id); err != nil {
		return documents.ReceiptData{}, err
	} else if ok {
		sName, sHandle := s.consumer(ctx, tf.senderID)
		rName, rHandle := s.consumer(ctx, tf.recipientID)
		ref := s.existingProofReference(ctx, tf.id, tf.environment)
		return documents.ReceiptData{
			ReceiptID: tf.id, TransactionID: tf.id, Reference: ref,
			Perspective: documents.PerspectiveConsumer,
			AmountMinor: tf.amountMinor, Currency: tf.currency, Status: tf.status,
			CreatedAt: tf.createdAt, CompletedAt: tf.updatedAt, IssuedAt: tf.updatedAt,
			PayerName: sName, PayerHandle: sHandle, RecipientName: rName, RecipientHandle: rHandle,
			PaymentMethod: "Transferência Banzami · @banza", Description: tf.description,
			VerificationReference: verificationRefOrEmpty(ref),
		}, nil
	}

	return documents.ReceiptData{}, ErrReceiptNotFound
}

type walletPaymentRow struct {
	id, merchantID, consumerID, currency, status, environment string
	amountMinor                                               int64
	createdAt                                                 time.Time
}

func (s *PostgresReceiptSource) walletPayment(ctx context.Context, id string) (walletPaymentRow, bool, error) {
	const q = `SELECT id::text, merchant_id::text, consumer_id::text, amount_minor, currency, status, environment, created_at
		FROM wallet_payments WHERE id::text = $1 OR transfer_id::text = $1 LIMIT 1`
	var w walletPaymentRow
	err := s.pool.QueryRow(ctx, q, id).Scan(&w.id, &w.merchantID, &w.consumerID, &w.amountMinor, &w.currency, &w.status, &w.environment, &w.createdAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return walletPaymentRow{}, false, nil
	}
	if err != nil {
		return walletPaymentRow{}, false, err
	}
	return w, true, nil
}

type transferRow struct {
	id, senderID, recipientID, currency, status, description string
	environment                                              string
	amountMinor                                              int64
	createdAt, updatedAt                                     time.Time
}

func (s *PostgresReceiptSource) transfer(ctx context.Context, id string) (transferRow, bool, error) {
	const q = `SELECT id::text, sender_id::text, recipient_id::text, amount_minor, currency, status,
		COALESCE(description,''), COALESCE(environment,'LIVE'), created_at, updated_at
		FROM transfers WHERE id::text = $1 LIMIT 1`
	var t transferRow
	err := s.pool.QueryRow(ctx, q, id).Scan(&t.id, &t.senderID, &t.recipientID, &t.amountMinor, &t.currency, &t.status, &t.description, &t.environment, &t.createdAt, &t.updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return transferRow{}, false, nil
	}
	if err != nil {
		return transferRow{}, false, err
	}
	return t, true, nil
}

// consumer returns (displayName-or-@handle, handle); empty on miss.
func (s *PostgresReceiptSource) consumer(ctx context.Context, id string) (name, handle string) {
	const q = `SELECT handle, COALESCE(display_name,'') FROM consumers WHERE id::text = $1 LIMIT 1`
	var dn string
	if err := s.pool.QueryRow(ctx, q, id).Scan(&handle, &dn); err != nil {
		return "", ""
	}
	if strings.TrimSpace(dn) != "" {
		return dn, handle
	}
	return "@" + handle, handle
}

func (s *PostgresReceiptSource) merchant(ctx context.Context, id string) string {
	const q = `SELECT name FROM merchants WHERE id::text = $1 LIMIT 1`
	var name string
	if err := s.pool.QueryRow(ctx, q, id).Scan(&name); err != nil {
		return ""
	}
	return name
}

// verificationRefOrEmpty keeps an absent proof absent rather than turning it into
// a URL with nothing after the slash.
func verificationRefOrEmpty(ref string) string {
	if strings.TrimSpace(ref) == "" {
		return ""
	}
	return "banzami.com/r/" + ref
}
