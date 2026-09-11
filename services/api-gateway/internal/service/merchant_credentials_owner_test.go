package service

// A Business App credential signs in as the owner of its handle, or not at all.
// A credential left pointing at a previous owner after its handle moved issued
// a session for the wrong Business Account — the app showed the handle and read
// a different wallet than the one the handle and its funds belong to.

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

func TestVerifyHandlePin_RefusesACredentialWhoseMerchantNoLongerOwnsTheHandle(t *testing.T) {
	pool := dbPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()
	svc := NewPostgresMerchantCredentialService(pool)

	mk := func() string {
		id := uuid.NewString()
		if _, err := pool.Exec(ctx, `INSERT INTO merchants (id, name, email, status) VALUES ($1,'cred-owner',$2,'ACTIVE')`,
			id, fmt.Sprintf("cred-%s@example.test", id[:8])); err != nil {
			t.Fatal(err)
		}
		return id
	}
	oldOwner, newOwner := mk(), mk()
	handle := "co" + strings.ReplaceAll(uuid.NewString(), "-", "")[:10]
	hash, _ := bcrypt.GenerateFromPassword([]byte("1357"), bcrypt.MinCost)
	if _, err := pool.Exec(ctx, `INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1,'MERCHANT',$2)`, handle, oldOwner); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO merchant_app_credentials (merchant_id, environment, handle, pin_hash, activated_at)
	                              VALUES ($1,'SANDBOX',$2,$3,$4)`, oldOwner, handle, string(hash), time.Now()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_app_credentials WHERE handle=$1`, handle)
		_, _ = pool.Exec(ctx, `DELETE FROM handle_registry WHERE handle=$1`, handle)
	})

	got, _, err := svc.VerifyHandlePin(ctx, handle, "1357")
	if err != nil || got != oldOwner {
		t.Fatalf("precondition: the owner signs in as itself, got %q %v", got, err)
	}

	// The handle moves; the credential does not.
	if _, err := pool.Exec(ctx, `UPDATE handle_registry SET owner_id=$2 WHERE handle=$1`, handle, newOwner); err != nil {
		t.Fatal(err)
	}
	got, _, err = svc.VerifyHandlePin(ctx, handle, "1357")
	if !errors.Is(err, ErrMerchantCredsInvalid) {
		t.Fatalf("a credential for a handle its merchant no longer owns signed in as %q (err %v)", got, err)
	}
}

// A suspended Business does not sign in, whatever its PIN. The Sandbox harness
// that proved this end to end (retired-authority-denied.sh) set its PIN through
// a route that has since been retired: a PIN is now set only by an activation
// link, which only an operator's approval issues. The refusal itself is the
// merchant-status check in VerifyHandlePin, proved here.
func TestVerifyHandlePin_RefusesASuspendedBusiness(t *testing.T) {
	pool := dbPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()
	svc := NewPostgresMerchantCredentialService(pool)

	id := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO merchants (id, name, email, status) VALUES ($1,'cred-suspended',$2,'ACTIVE')`,
		id, fmt.Sprintf("cred-%s@example.test", id[:8])); err != nil {
		t.Fatal(err)
	}
	handle := "cs" + strings.ReplaceAll(uuid.NewString(), "-", "")[:10]
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

	if got, _, err := svc.VerifyHandlePin(ctx, handle, "2468"); err != nil || got != id {
		t.Fatalf("precondition: an active Business signs in, got %q %v", got, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE merchants SET status='SUSPENDED' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if got, _, err := svc.VerifyHandlePin(ctx, handle, "2468"); err == nil {
		t.Fatalf("a suspended Business signed in as %q", got)
	}
}
