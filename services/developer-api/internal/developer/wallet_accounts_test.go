package developer

import (
	"context"
	"errors"
	"sync"
	"testing"
)

// Wallet accounts: the segregated destinations a developer builds with. The
// primitive itself is not new — DOA has used it through the published SDK all
// along — but opening one from the Console is, and its authority is tested here
// rather than assumed to match some neighbouring capability's.

type fakeWalletProv struct {
	mu       sync.Mutex
	created  int
	gotArgs  []string
	err      error
	noWallet bool
}

func (f *fakeWalletProv) WalletForMerchant(_ context.Context, merchantID string) (string, error) {
	if f.noWallet {
		return "", nil
	}
	return "wallet_of_" + merchantID, nil
}

func (f *fakeWalletProv) CreateWalletAccount(_ context.Context, walletID, merchantID, purpose, refType, refID, label string) (string, error) {
	f.mu.Lock()
	f.created++
	n := f.created
	f.gotArgs = []string{walletID, merchantID, purpose, refType, refID, label}
	f.mu.Unlock()
	if f.err != nil {
		return "", f.err
	}
	return "wa_" + itoa(n), nil
}

func (f *fakeWalletProv) count() int { f.mu.Lock(); defer f.mu.Unlock(); return f.created }

// walletSvc: a bound project, ready to open destinations.
func walletSvc(t *testing.T) (*Service, *fakeWalletProv, string) {
	t.Helper()
	s, _, pid := setupSvc(t)
	if _, err := configureForTest(s, "u_owner", pid); err != nil {
		t.Fatal(err)
	}
	f := &fakeWalletProv{}
	s.SetWalletAccountProvisioner(f)
	return s, f, pid
}

func req2() WalletAccountRequest {
	return WalletAccountRequest{Label: "Campanha A", Purpose: "CAMPAIGN", ReferenceType: "DOA_CAMPAIGN", ReferenceID: "camp-a"}
}

// Building, not spending. A DEVELOPER writes the application and knows how many
// destinations it needs; FINANCE and VIEWER build nothing.
func TestWalletAccount_RoleMatrix(t *testing.T) {
	cases := []struct {
		actor, role string
		allow       bool
		why         string
	}{
		{"u_owner", RoleOwner, true, "accountable for the workspace"},
		{"u_admin", RoleAdmin, true, "manages the workspace"},
		{"u_dev", RoleDeveloper, true, "writes the application that needs the destination"},
		{"u_fin", RoleFinance, false, "builds nothing"},
		{"u_view", RoleViewer, false, "read-only"},
	}
	for _, c := range cases {
		t.Run(c.role, func(t *testing.T) {
			s, f, pid := walletSvc(t)
			_, err := s.CreateProjectWalletAccount(bg, c.actor, pid, req2(), "", "")
			if c.allow {
				if err != nil {
					t.Fatalf("%s (%s) should open an account: %v", c.role, c.why, err)
				}
				return
			}
			if !errors.Is(err, ErrForbidden) {
				t.Fatalf("%s (%s) must be denied, got %v", c.role, c.why, err)
			}
			if f.count() != 0 {
				t.Errorf("%s reached Core despite being denied", c.role)
			}
		})
	}
}

// The owner is derived. There is no request field for it, and this is the
// assertion that fails if someone adds one "for convenience".
func TestWalletAccount_OwnerComesFromTheBinding(t *testing.T) {
	s, f, pid := walletSvc(t)
	if _, err := s.CreateProjectWalletAccount(bg, "u_owner", pid, req2(), "", ""); err != nil {
		t.Fatal(err)
	}
	b, _ := s.store.ActiveBindingForProject(bg, pid)
	if f.gotArgs[1] != b.MerchantID {
		t.Errorf("Core got merchant %q, want the bound %q", f.gotArgs[1], b.MerchantID)
	}
	if f.gotArgs[0] != "wallet_of_"+b.MerchantID {
		t.Errorf("Core got wallet %q — it must be the bound owner's", f.gotArgs[0])
	}
	// The application's own metadata, passed through untouched — the operator has
	// no knowledge of what DOA_CAMPAIGN means and must not acquire any.
	if f.gotArgs[3] != "DOA_CAMPAIGN" || f.gotArgs[4] != "camp-a" {
		t.Errorf("Core got reference %q/%q — the caller's own correlation metadata must pass through", f.gotArgs[3], f.gotArgs[4])
	}
}

// A project with no financial environment gets the step it is missing, not a
// failure and not a not-found.
func TestWalletAccount_UnconfiguredProjectIsToldWhatToDo(t *testing.T) {
	s, _, pid := setupSvc(t)
	s.SetWalletAccountProvisioner(&fakeWalletProv{})

	_, err := s.CreateProjectWalletAccount(bg, "u_owner", pid, req2(), "", "")
	if !errors.Is(err, ErrFinancialSetupRequired) {
		t.Fatalf("want FinancialSetupRequired, got %v", err)
	}
}

// PRIMARY is made with the wallet and there is exactly one. Offering it would be
// offering an operation that cannot succeed.
func TestWalletAccount_PrimaryIsNotOnOffer(t *testing.T) {
	s, f, pid := walletSvc(t)
	r := req2()
	r.Purpose = "PRIMARY"
	if _, err := s.CreateProjectWalletAccount(bg, "u_owner", pid, r, "", ""); !errors.Is(err, ErrUnsupportedPurpose) {
		t.Fatalf("want ErrUnsupportedPurpose, got %v", err)
	}
	if f.count() != 0 {
		t.Error("a PRIMARY request reached Core")
	}
	// …and an invented purpose is refused rather than passed through.
	r.Purpose = "WHATEVER"
	if _, err := s.CreateProjectWalletAccount(bg, "u_owner", pid, r, "", ""); !errors.Is(err, ErrUnsupportedPurpose) {
		t.Fatalf("unknown purpose: want ErrUnsupportedPurpose, got %v", err)
	}
}

func TestWalletAccount_LabelIsRequiredAndBounded(t *testing.T) {
	s, f, pid := walletSvc(t)
	for _, label := range []string{"", "   ", string(make([]byte, 81))} {
		r := req2()
		r.Label = label
		if _, err := s.CreateProjectWalletAccount(bg, "u_owner", pid, r, "", ""); !errors.Is(err, ErrValidation) {
			t.Errorf("label %q: want Validation, got %v", label, err)
		}
	}
	if f.count() != 0 {
		t.Error("an invalid label reached Core")
	}
}

// A non-member gets not-found, the same as for a project that does not exist.
func TestWalletAccount_NonMemberCannotTellTheProjectExists(t *testing.T) {
	s, f, pid := walletSvc(t)
	if _, err := s.CreateProjectWalletAccount(bg, "u_outsider", pid, req2(), "", ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("non-member: want NotFound, got %v", err)
	}
	if f.count() != 0 {
		t.Error("an outsider reached Core")
	}
}

// Two destinations under one project are two accounts, not one reused.
func TestWalletAccount_SiblingsAreDistinct(t *testing.T) {
	s, f, pid := walletSvc(t)
	a, err := s.CreateProjectWalletAccount(bg, "u_owner", pid, WalletAccountRequest{Label: "A", Purpose: "CAMPAIGN", ReferenceType: "SHOP", ReferenceID: "a"}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.CreateProjectWalletAccount(bg, "u_owner", pid, WalletAccountRequest{Label: "B", Purpose: "STORE", ReferenceType: "SHOP", ReferenceID: "b"}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if a.ID == b.ID {
		t.Error("two destinations came back as one account — a payment for A could be confused with one for B")
	}
	if f.count() != 2 {
		t.Errorf("Core was asked %d times for two accounts", f.count())
	}
}

// The purpose list must not force an external developer to describe their
// product in the first application's words. A shop is a STORE, a marketplace
// seller is a PROJECT, and anything these do not fit is CUSTOM.
func TestWalletAccount_PurposesAreGenericNotDoaShaped(t *testing.T) {
	for _, purpose := range PublicWalletAccountPurposes {
		s, f, pid := walletSvc(t)
		r := req2()
		r.Purpose = purpose
		if _, err := s.CreateProjectWalletAccount(bg, "u_owner", pid, r, "", ""); err != nil {
			t.Errorf("purpose %s should be open to developers: %v", purpose, err)
		}
		if f.count() != 1 {
			t.Errorf("purpose %s did not reach Core", purpose)
		}
	}
}

// The public list is a SUBSET of Core's, and the exclusions are the point.
//
// Core accepts ESCROW, RESERVE and SETTLEMENT. Purpose changes no behaviour
// anywhere — the only comparison in the whole stack is against PRIMARY — so
// those three are labels that promise holding, protection and transit that
// nothing implements. A name that claims a guarantee the platform does not
// provide is a security claim, and this is the test that keeps it from being
// added back because "Core accepts it".
func TestWalletAccount_MisleadingPurposesAreNotOffered(t *testing.T) {
	for _, p := range []string{"ESCROW", "RESERVE", "SETTLEMENT"} {
		if walletAccountPurposes[p] {
			t.Errorf("%s is offered publicly — it names a guarantee nothing enforces", p)
		}
	}
	if walletAccountPurposes["PRIMARY"] {
		t.Error("PRIMARY is on offer and Core refuses it")
	}
	// …and the ones that remain say only what a destination is for.
	for _, p := range []string{"CAMPAIGN", "STORE", "PROJECT", "EVENT", "CUSTOM"} {
		if !walletAccountPurposes[p] {
			t.Errorf("%s should be publicly available", p)
		}
	}
}
