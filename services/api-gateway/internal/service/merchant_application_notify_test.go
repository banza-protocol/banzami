package service

import (
	"context"
	"sync"
	"testing"

	"github.com/google/uuid"
)

type countingNotifier struct {
	mu      sync.Mutex
	notices []ApplicationCreatedNotice
}

func (c *countingNotifier) ApplicationCreated(_ context.Context, n ApplicationCreatedNotice) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.notices = append(c.notices, n)
}

// The confirmation is a consequence of a genuine creation: it fires once on
// create and NOT on an idempotent replay (a double-submit must not send a second
// receipt). The notice carries the real reference, business name and locale.
func TestSubmit_NotifiesOnceOnCreationNotOnReplay(t *testing.T) {
	pool := dbPoolOrSkip(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	cn := &countingNotifier{}
	svc := NewPostgresMerchantApplicationService(pool).WithNotifier(cn)

	key := uuid.NewString()
	handle := "nt" + uuid.NewString()[:8]
	in := completeInput(handle)
	in.BusinessName, in.Email, in.Locale = "Notify Co", handle+"@example.test", "pt"
	in.IdempotencyKey = key
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM merchant_applications WHERE desired_handle = $1`, handle)
		_, _ = pool.Exec(context.Background(), `DELETE FROM handle_registry WHERE handle = $1`, handle)
	})

	id, err := svc.Submit(ctx, in)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := svc.Submit(ctx, in); err != nil { // idempotent replay
		t.Fatalf("replay: %v", err)
	}

	cn.mu.Lock()
	defer cn.mu.Unlock()
	if len(cn.notices) != 1 {
		t.Fatalf("notified %d times, want exactly 1 (create only, not replay)", len(cn.notices))
	}
	got := cn.notices[0]
	if got.ApplicationID != id {
		t.Errorf("notice reference %q != application id %q", got.ApplicationID, id)
	}
	if got.BusinessName != "Notify Co" || got.Email != in.Email || got.Locale != "pt" {
		t.Errorf("notice = %+v, want the submitted business/email/locale", got)
	}
}
