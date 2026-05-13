package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// ErrInvalidCredentials is returned when handle+PIN do not match.
var ErrInvalidCredentials = errors.New("invalid handle or PIN")

// ErrHandleAlreadyRegistered is returned when the handle is taken.
var ErrHandleAlreadyRegistered = errors.New("handle already registered")

// CredentialStore persists consumer PIN hashes in public_api_credentials.
// It is the only table owned by this service — all financial data lives in core.
type CredentialStore struct {
	pool *pgxpool.Pool
}

func NewCredentialStore(pool *pgxpool.Pool) *CredentialStore {
	return &CredentialStore{pool: pool}
}

// credentialRow mirrors the public_api_credentials table.
type credentialRow struct {
	ConsumerID string
	Handle     string
	PinHash    string
	CreatedAt  time.Time
}

// Save persists a new credential record. Returns ErrHandleAlreadyRegistered
// if the handle is already taken.
func (s *CredentialStore) Save(ctx context.Context, consumerID, handle, rawPin string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(rawPin), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("bcrypt: %w", err)
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO public_api_credentials (consumer_id, handle, pin_hash)
		 VALUES ($1, $2, $3)`,
		consumerID, handle, string(hash),
	)
	if err != nil {
		if isUniqueViolation(err) {
			return ErrHandleAlreadyRegistered
		}
		return fmt.Errorf("credential insert: %w", err)
	}
	return nil
}

// Verify checks handle+PIN and returns the consumer ID on success.
// Returns ErrInvalidCredentials on mismatch.
func (s *CredentialStore) Verify(ctx context.Context, handle, rawPin string) (string, error) {
	var row credentialRow
	err := s.pool.QueryRow(ctx,
		`SELECT consumer_id, handle, pin_hash FROM public_api_credentials WHERE handle = $1`,
		handle,
	).Scan(&row.ConsumerID, &row.Handle, &row.PinHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrInvalidCredentials
		}
		return "", fmt.Errorf("credential lookup: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(row.PinHash), []byte(rawPin)); err != nil {
		return "", ErrInvalidCredentials
	}

	return row.ConsumerID, nil
}

func isUniqueViolation(err error) bool {
	return err != nil && (contains(err.Error(), "23505") ||
		contains(err.Error(), "duplicate key"))
}
