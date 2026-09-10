package service

import (
	"errors"
	"testing"
	"time"
)

// An operator gives a Business that forgot its PIN a fresh activation link.
// Nothing changes until it is used; using it sets the new PIN and signs out
// everything signed in with the old one.
func TestBusinessPinReset_RecoversAnActivatedLogin(t *testing.T) {
	f := newSessionFixture(t)
	act := NewPostgresActivationService(f.pool)
	creds := NewPostgresMerchantCredentialService(f.pool)
	sessions := NewPostgresMerchantSessionService(f.pool)
	reset := NewBusinessPinResetService(f.pool)

	// Never activated: nothing to recover — reissue the activation instead.
	if _, err := reset.Reset(f.ctx, f.merchant, time.Hour); !errors.Is(err, ErrPinResetNoLogin) {
		t.Fatalf("reset of a never-activated login: want ErrPinResetNoLogin, got %v", err)
	}

	// First activation, and a session opened with that PIN.
	tok, err := act.CreateToken(f.ctx, f.merchant, "SANDBOX", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if err := act.Complete(f.ctx, tok, "481516"); err != nil {
		t.Fatalf("first activation: %v", err)
	}
	open, err := sessions.Open(f.ctx, f.merchant, "SANDBOX")
	if err != nil {
		t.Fatal(err)
	}

	first, err := reset.Reset(f.ctx, f.merchant, time.Hour)
	if err != nil || first.ActivationToken == "" || first.Handle != f.handle {
		t.Fatalf("reset: %+v %v", first, err)
	}
	if _, _, err := creds.VerifyHandlePin(f.ctx, f.handle, "481516"); err != nil {
		t.Fatalf("the old PIN must keep working until the link is used: %v", err)
	}
	second, err := reset.Reset(f.ctx, f.merchant, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if err := act.Complete(f.ctx, first.ActivationToken, "999999"); !errors.Is(err, ErrActivationExpired) {
		t.Fatalf("a link replaced by a newer reset must not work: %v", err)
	}
	if err := act.Complete(f.ctx, second.ActivationToken, "234234"); err != nil {
		t.Fatalf("completing the reset: %v", err)
	}
	if _, _, err := creds.VerifyHandlePin(f.ctx, f.handle, "481516"); err == nil {
		t.Fatal("the old PIN still signs in after the reset")
	}
	if _, _, err := creds.VerifyHandlePin(f.ctx, f.handle, "234234"); err != nil {
		t.Fatalf("the new PIN does not sign in: %v", err)
	}
	if _, err := sessions.Renew(f.ctx, open.RefreshToken); err == nil {
		t.Fatal("a session opened with the old PIN still renews after the reset")
	}

	// A suspended Business is not given a way back in.
	if _, err := f.pool.Exec(f.ctx, `UPDATE merchants SET status='SUSPENDED' WHERE id=$1`, f.merchant); err != nil {
		t.Fatal(err)
	}
	if _, err := reset.Reset(f.ctx, f.merchant, time.Hour); !errors.Is(err, ErrPinResetNotActive) {
		t.Fatalf("reset of a suspended business: want ErrPinResetNotActive, got %v", err)
	}
}
