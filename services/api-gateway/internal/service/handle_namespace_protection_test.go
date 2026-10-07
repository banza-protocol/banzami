package service

// Namespace protection on the Business side: reserved + protected @banza names
// are blocked from normal application, and the PUBLIC availability check never
// discloses which class a name is (CLAUDE.md §2.8; namespace-protection brief
// §10/§12/§16).

import (
	"testing"
	"time"
)

// Pure unit test — no DB. classifyHandle must block SYSTEM, PROTECTED and any
// row carrying a reserved_reason, and must never report a name free while it is
// held.
func TestClassifyHandle_ProtectedAndReservedBlocked(t *testing.T) {
	reason := "bank"
	future := time.Now().Add(24 * time.Hour)
	past := time.Now().Add(-24 * time.Hour)

	cases := []struct {
		name      string
		ownerType string
		reserved  *string
		until     *time.Time
		wantAvail bool
	}{
		{"system reserved", "SYSTEM", strptr("reserved"), nil, false},
		{"protected bank", "PROTECTED", &reason, nil, false},
		{"protected without reason still blocked", "PROTECTED", nil, nil, false},
		{"consumer owned", "CONSUMER", nil, nil, false},
		{"merchant owned", "MERCHANT", nil, nil, false},
		{"live application hold", "APPLICATION", nil, &future, false},
		{"expired application hold is free", "APPLICATION", nil, &past, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			avail, _ := classifyHandle(c.ownerType, c.reserved, c.until)
			if avail != c.wantAvail {
				t.Fatalf("classifyHandle(%s) available=%v, want %v", c.ownerType, avail, c.wantAvail)
			}
		})
	}
}

func strptr(s string) *string { return &s }

// DB test — self-seeds representative reserved/protected rows (independent of
// whether migration 0171 ran on the test DB) and proves the public availability
// check returns a single neutral reason and never leaks the class.
func TestCheckHandle_NeutralForReservedAndProtected(t *testing.T) {
	f := newLifecycle(t)
	svc := NewPostgresMerchantApplicationService(f.pool)

	seed := func(handle, ownerType, reason, category string) {
		f.exec(`INSERT INTO handle_registry (handle, owner_type, reserved_reason, protect_category)
		        VALUES ($1,$2,$3,$4) ON CONFLICT (handle) DO NOTHING`, handle, ownerType, reason, category)
		f.clean = append(f.clean, func() {
			_, _ = f.pool.Exec(f.ctx, `DELETE FROM handle_registry WHERE handle=$1 AND owner_id IS NULL`, handle)
		})
	}

	// A representative name from each protected class, plus an internal reserved.
	suffix := hex10()
	reserved := "zadmin" + suffix           // internal reserved (SYSTEM)
	brand := "zbanzami" + suffix            // brand (PROTECTED)
	bank := "zbai" + suffix                 // bank (PROTECTED)
	impersonation := "zbanzamisup" + suffix // impersonation combo (PROTECTED)
	payment := "zvisa" + suffix             // payment brand (PROTECTED)
	seed(reserved, "SYSTEM", "reserved", "internal")
	seed(brand, "PROTECTED", "brand", "brand")
	seed(bank, "PROTECTED", "bank", "bank")
	seed(impersonation, "PROTECTED", "brand", "brand-impersonation")
	seed(payment, "PROTECTED", "payment-brand", "payment-brand")

	for _, h := range []string{reserved, brand, bank, impersonation, payment} {
		avail, reason, err := svc.CheckHandle(f.ctx, h)
		if err != nil {
			t.Fatalf("CheckHandle(%s): %v", h, err)
		}
		if avail {
			t.Fatalf("protected/reserved handle %s reported available", h)
		}
		// The ONLY non-available public reason is the neutral one.
		if reason != HandleReasonUnavailable {
			t.Fatalf("CheckHandle(%s) leaked class via reason %q, want %q", h, reason, HandleReasonUnavailable)
		}
	}

	// Case folding: an upper/mixed-case spelling of a protected name resolves to
	// the same normalized handle and is just as unavailable.
	if avail, reason, err := svc.CheckHandle(f.ctx, "  @"+toUpper(brand)+"  "); err != nil || avail || reason != HandleReasonUnavailable {
		t.Fatalf("case/space variant of a protected handle escaped protection: avail=%v reason=%q err=%v", avail, reason, err)
	}

	// A plainly free name is still available (protection is explicit, not broad).
	free := "zlivre" + suffix
	if avail, _, err := svc.CheckHandle(f.ctx, free); err != nil || !avail {
		t.Fatalf("a non-reserved handle was blocked: avail=%v err=%v", avail, err)
	}
}

func toUpper(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'a' && b[i] <= 'z' {
			b[i] -= 32
		}
	}
	return string(b)
}
