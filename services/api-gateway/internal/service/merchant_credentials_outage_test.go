package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// A8-09 — VerifyHandlePin returned a database failure raw, indistinguishable
// from a refusal to a caller that checks only for lockout. It is now marked as
// the store being unavailable, and is never a credentials refusal.
func TestVerifyHandlePin_UnreachableStoreIsUnavailableNotInvalid(t *testing.T) {
	pool, err := pgxpool.New(context.Background(), "postgres://nobody:x@127.0.0.1:1/none?connect_timeout=2")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, _, err = NewPostgresMerchantCredentialService(pool).VerifyHandlePin(ctx, "doa_sandbox", "1234")
	if !errors.Is(err, ErrMerchantCredsUnavailable) {
		t.Fatalf("err = %v, want ErrMerchantCredsUnavailable", err)
	}
	if errors.Is(err, ErrMerchantCredsInvalid) || errors.Is(err, ErrMerchantLocked) {
		t.Fatalf("an unreachable store was classed as a refusal: %v", err)
	}
}
