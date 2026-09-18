package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

// A3-05. The application id is the applicant's bearer capability. A global,
// trimmed idempotency key handed the id of someone else's application to
// whoever replayed their key. A replay now answers only the same submission.
func TestSubmit_AReplayAnswersOnlyTheSameSubmission(t *testing.T) {
	pool := dbPoolOrSkip(t)
	t.Cleanup(pool.Close) // not defer: Cleanups run after defers, and a closed pool made every cleanup a silent no-op
	ctx := context.Background()
	svc := NewPostgresMerchantApplicationService(pool)
	key := uuid.NewString()
	handle := "ik" + uuid.NewString()[:8]
	// Complete: this asserts idempotency, and since Phase C.1 an incomplete
	// submission is refused before an idempotency key is ever recorded.
	in := completeInput(handle)
	in.BusinessName, in.Email = "Idem", handle+"@example.test"
	in.IdempotencyKey = key
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM merchant_applications WHERE desired_handle = $1`, handle)
		_, _ = pool.Exec(context.Background(), `DELETE FROM handle_registry WHERE handle = $1`, handle)
	})

	first, err := svc.Submit(ctx, in)
	if err != nil {
		t.Fatalf("first submission: %v", err)
	}
	again, err := svc.Submit(ctx, in)
	if err != nil || again != first {
		t.Fatalf("the same submission replayed as %q (err %v), want %q", again, err, first)
	}

	stranger := in
	stranger.Email = "attacker@example.test"
	if id, err := svc.Submit(ctx, stranger); !errors.Is(err, ErrApplicationKeyReused) {
		t.Fatalf("another submission under the same key got %q (err %v) — the applicant's capability", id, err)
	}

	padded := in
	padded.IdempotencyKey = " " + key + " "
	if id, err := svc.Submit(ctx, padded); err == nil && id == first {
		t.Fatal("a padded key was treated as the same key")
	}
}
