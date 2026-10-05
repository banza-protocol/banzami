package service

// The public deletion-request intake: a correct code proves email control (and
// only that); a wrong/expired code, a replay, or too many guesses are all refused
// without revealing which. None of it can reach EXECUTED — that needs an operator
// ownership check, enforced by the DB CHECK (proven in a separate migration test).

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestAccountDeletionRequest_VerifyHappyPath(t *testing.T) {
	pool := dbPoolOrSkip(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	svc := NewAccountDeletionRequestService(pool, "test-pepper")
	if svc == nil {
		t.Fatal("service should be constructed with a pepper + pool")
	}

	created, err := svc.Create(ctx, "CONSUMER", "someconsumer", "owner@example.test")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM account_deletion_requests WHERE id=$1`, created.RequestID) })

	if len(created.Code) != 6 {
		t.Fatalf("expected a 6-digit code, got %q", created.Code)
	}
	// The raw code must never be stored — only its HMAC.
	var stored string
	if err := pool.QueryRow(ctx, `SELECT COALESCE(email_otp_hash,'') FROM account_deletion_requests WHERE id=$1`, created.RequestID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == created.Code || stored == "" {
		t.Fatalf("the OTP must be stored hashed, not as the raw code (stored=%q)", stored)
	}

	if err := svc.Verify(ctx, created.RequestID, created.Code); err != nil {
		t.Fatalf("a correct code should verify, got %v", err)
	}
	var status string
	var hash *string
	if err := pool.QueryRow(ctx, `SELECT status, email_otp_hash FROM account_deletion_requests WHERE id=$1`, created.RequestID).Scan(&status, &hash); err != nil {
		t.Fatal(err)
	}
	if status != "EMAIL_VERIFIED" {
		t.Fatalf("status after verify = %q, want EMAIL_VERIFIED", status)
	}
	if hash != nil {
		t.Fatal("the OTP hash should be cleared after verification so it cannot be replayed")
	}

	// A second verify on an already-verified request is inert (non-enumerating).
	if err := svc.Verify(ctx, created.RequestID, created.Code); !errors.Is(err, ErrDeletionRequestInvalid) {
		t.Fatalf("replaying a verified request should be refused, got %v", err)
	}
}

func TestAccountDeletionRequest_WrongCodeRefusedAndCounts(t *testing.T) {
	pool := dbPoolOrSkip(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	svc := NewAccountDeletionRequestService(pool, "test-pepper")

	created, err := svc.Create(ctx, "BUSINESS", "somebiz", "biz@example.test")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM account_deletion_requests WHERE id=$1`, created.RequestID) })

	wrong := "000000"
	if wrong == created.Code {
		wrong = "111111"
	}
	if err := svc.Verify(ctx, created.RequestID, wrong); !errors.Is(err, ErrDeletionRequestInvalid) {
		t.Fatalf("a wrong code should be refused, got %v", err)
	}
	var attempts int
	if err := pool.QueryRow(ctx, `SELECT otp_attempts FROM account_deletion_requests WHERE id=$1`, created.RequestID).Scan(&attempts); err != nil {
		t.Fatal(err)
	}
	if attempts != 1 {
		t.Fatalf("a failed attempt should be counted, got %d", attempts)
	}
	// The correct code still works while under the ceiling.
	if err := svc.Verify(ctx, created.RequestID, created.Code); err != nil {
		t.Fatalf("the correct code should still verify after one wrong try, got %v", err)
	}
}

func TestAccountDeletionRequest_LocksAfterTooManyAttempts(t *testing.T) {
	pool := dbPoolOrSkip(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	svc := NewAccountDeletionRequestService(pool, "test-pepper")

	created, err := svc.Create(ctx, "CONSUMER", "lockme", "lock@example.test")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM account_deletion_requests WHERE id=$1`, created.RequestID) })

	wrong := "000000"
	if wrong == created.Code {
		wrong = "111111"
	}
	for i := 0; i < deletionMaxAttempts; i++ {
		if err := svc.Verify(ctx, created.RequestID, wrong); !errors.Is(err, ErrDeletionRequestInvalid) {
			t.Fatalf("attempt %d should be a plain refusal, got %v", i, err)
		}
	}
	// Ceiling reached: even the correct code is now refused as locked.
	if err := svc.Verify(ctx, created.RequestID, created.Code); !errors.Is(err, ErrDeletionRequestLocked) {
		t.Fatalf("after the attempt ceiling the request should be locked, got %v", err)
	}
}

func TestAccountDeletionRequest_ExpiredCodeRefused(t *testing.T) {
	pool := dbPoolOrSkip(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	svc := NewAccountDeletionRequestService(pool, "test-pepper")

	created, err := svc.Create(ctx, "CONSUMER", "expireme", "exp@example.test")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM account_deletion_requests WHERE id=$1`, created.RequestID) })

	// Force the code into the past.
	if _, err := pool.Exec(ctx, `UPDATE account_deletion_requests SET otp_expires_at=$2 WHERE id=$1`,
		created.RequestID, time.Now().Add(-time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err := svc.Verify(ctx, created.RequestID, created.Code); !errors.Is(err, ErrDeletionRequestInvalid) {
		t.Fatalf("an expired code should be refused, got %v", err)
	}
}

func TestAccountDeletionRequest_UnknownIdRefused(t *testing.T) {
	pool := dbPoolOrSkip(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	svc := NewAccountDeletionRequestService(pool, "test-pepper")

	if err := svc.Verify(ctx, uuid.NewString(), "123456"); !errors.Is(err, ErrDeletionRequestInvalid) {
		t.Fatalf("an unknown request id should be refused, got %v", err)
	}
	// A non-UUID id is refused without touching the DB.
	if err := svc.Verify(ctx, "not-a-uuid", "123456"); !errors.Is(err, ErrDeletionRequestInvalid) {
		t.Fatalf("a malformed id should be refused, got %v", err)
	}
}

func TestNewAccountDeletionRequestService_FailClosedWithoutPepper(t *testing.T) {
	if NewAccountDeletionRequestService(nil, "") != nil {
		t.Fatal("no pool + no pepper must yield a nil (disabled) service")
	}
}
