package service

// The untrusted-login throttle: a key is blocked once it reaches its budget in
// the window, and the block is persistent — a fresh throttle (a new instance /
// after a restart) reads it from the DB. Keys are independent.

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// A keyless throttle (empty pepper) must never be built — otherwise sources would
// be hashed with an empty key and the protection would be silently weakened. The
// constructor returns nil, which the login path treats as "fail closed", not as
// "run unthrottled". No DB needed.
func TestNewSourceThrottle_RefusesEmptySecret(t *testing.T) {
	if th := NewSourceThrottle(nil, "secret"); th != nil {
		t.Fatal("no pool → nil throttle")
	}
	// A non-nil pool pointer with an empty/whitespace pepper must still be refused.
	fake := &pgxpool.Pool{}
	if th := NewSourceThrottle(fake, ""); th != nil {
		t.Fatal("empty secret must NOT build a keyless throttle")
	}
	if th := NewSourceThrottle(fake, "   "); th != nil {
		t.Fatal("whitespace-only secret must NOT build a keyless throttle")
	}
	if th := NewSourceThrottle(fake, "real-secret"); th == nil {
		t.Fatal("a real secret with a pool must build a throttle")
	}
}

func TestThrottle_BlocksAtCapAndPersists(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed throttle test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	th := NewSourceThrottle(pool, "test-pepper")
	raw := SourceKey("ip:" + uuid.NewString())
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM consumer_login_source_throttle WHERE source=$1`, th.key(raw))
	})

	// Below the cap: not blocked.
	for i := 0; i < CapPerSource()-1; i++ {
		if _, err := th.RecordFailure(ctx, raw, ThrottleWindow(), CapPerSource(), ThrottleBlock()); err != nil {
			t.Fatal(err)
		}
	}
	if blocked, err := th.Blocked(ctx, raw); err != nil || blocked {
		t.Fatalf("below the cap must not be blocked, got %v %v", blocked, err)
	}

	// The failure that reaches the cap blocks the key.
	if _, err := th.RecordFailure(ctx, raw, ThrottleWindow(), CapPerSource(), ThrottleBlock()); err != nil {
		t.Fatal(err)
	}
	if blocked, err := th.Blocked(ctx, raw); err != nil || !blocked {
		t.Fatalf("at the cap must be blocked, got %v %v", blocked, err)
	}

	// Persistence across instances.
	fresh := NewSourceThrottle(pool, "test-pepper")
	if blocked, err := fresh.Blocked(ctx, raw); err != nil || !blocked {
		t.Fatalf("the block must survive across instances, got %v %v", blocked, err)
	}

	// Independent keys are unaffected.
	other := SourceKey("ip:" + uuid.NewString())
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM consumer_login_source_throttle WHERE source=$1`, th.key(other))
	})
	if blocked, err := th.Blocked(ctx, other); err != nil || blocked {
		t.Fatalf("an unrelated key must not be blocked, got %v %v", blocked, err)
	}
}
