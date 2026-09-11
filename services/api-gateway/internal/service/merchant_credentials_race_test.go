package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// A9-03. The Business PIN lockout was read, then the PIN compared, then the
// failure counted — so concurrent guesses all passed the check. The attempt is
// now claimed before the comparison: however many race, at most five are
// compared, and then the credential is locked.
func TestVerifyHandlePin_ConcurrentGuessesCannotPassTheLimit(t *testing.T) {
	pool := dbPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()
	svc := NewPostgresMerchantCredentialService(pool)

	id := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO merchants (id, name, email, status) VALUES ($1,'race',$2,'ACTIVE')`,
		id, fmt.Sprintf("race-%s@example.test", id[:8])); err != nil {
		t.Fatal(err)
	}
	handle := "rc" + strings.ReplaceAll(uuid.NewString(), "-", "")[:10]
	hash, _ := bcrypt.GenerateFromPassword([]byte("2468"), bcrypt.MinCost)
	if _, err := pool.Exec(ctx, `INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1,'MERCHANT',$2)`, handle, id); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO merchant_app_credentials (merchant_id, environment, handle, pin_hash, activated_at)
	                              VALUES ($1,'SANDBOX',$2,$3,$4)`, id, handle, string(hash), time.Now()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_app_credentials WHERE handle=$1`, handle)
		_, _ = pool.Exec(ctx, `DELETE FROM handle_registry WHERE handle=$1`, handle)
	})

	var compared atomic.Int32
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if _, _, err := svc.VerifyHandlePin(ctx, handle, "1111"); errors.Is(err, ErrMerchantCredsInvalid) {
				compared.Add(1) // only a compared, wrong PIN answers "invalid"
			}
		}()
	}
	close(start)
	wg.Wait()
	if n := compared.Load(); n > maxPinAttempts {
		t.Fatalf("%d concurrent guesses were compared, want at most %d", n, maxPinAttempts)
	}
	if _, _, err := svc.VerifyHandlePin(ctx, handle, "2468"); !errors.Is(err, ErrMerchantLocked) {
		t.Fatalf("after the limit, the right PIN must wait for the lock; got %v", err)
	}
}
