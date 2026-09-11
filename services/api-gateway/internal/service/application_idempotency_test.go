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
	defer pool.Close()
	ctx := context.Background()
	svc := NewPostgresMerchantApplicationService(pool)
	key := uuid.NewString()
	handle := "ik" + uuid.NewString()[:8]
	in := MerchantApplicationInput{
		Environment: "SANDBOX", DesiredHandle: handle, BusinessName: "Idem", Email: handle + "@example.test",
		TermsAccepted: true, Origin: ApplicationOriginStandalone, IdempotencyKey: key,
	}
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
