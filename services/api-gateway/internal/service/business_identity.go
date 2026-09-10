package service

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BusinessIdentity is a Business's public identity as receipts, proofs and the
// payer's screens show it (business_public_identities): the @handle it owns
// and the name it presents. Never the name of a Project that created a link.
type BusinessIdentity struct {
	DisplayName string `json:"display_name"`
	Handle      string `json:"handle,omitempty"`
}

var ErrBusinessNotFound = errors.New("business not found")

func LookupBusinessIdentity(ctx context.Context, pool *pgxpool.Pool, merchantID string) (BusinessIdentity, error) {
	var b BusinessIdentity
	err := pool.QueryRow(ctx,
		`SELECT display_name, COALESCE(handle, '') FROM business_public_identities WHERE merchant_id::text = $1`,
		merchantID).Scan(&b.DisplayName, &b.Handle)
	if errors.Is(err, pgx.ErrNoRows) {
		return BusinessIdentity{}, ErrBusinessNotFound
	}
	return b, err
}
