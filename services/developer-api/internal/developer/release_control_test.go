package developer

import "testing"

// Deploy-vs-release control (RT04C §1). Deploying the payment code must NOT make
// payment scopes publicly issuable: until the operator releases the capability,
// payment scopes are rejected on the public (Console) key-creation path, while
// operator-provisioned E2E fixture keys may still carry them.

func TestReleaseControl_UnreleasedRejectsPublicPaymentScopes(t *testing.T) {
	s, _, ws := wsWithRoles(t) // default: paymentReleased=false
	pid := mkProject(t, s, "u_owner", ws)

	// A non-payment scope is always issuable.
	if _, _, err := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "id", []string{"identity:read"}, "", ""); err != nil {
		t.Fatalf("identity:read must always be issuable: %v", err)
	}
	// Payment scopes are NOT selectable to ordinary developers while unreleased.
	for _, sc := range []string{"payment_sessions:write", "payment_sessions:read", "payment_links:write", "payment_links:read"} {
		if _, _, err := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "k", []string{sc}, "", ""); err != ErrValidation {
			t.Errorf("unreleased: public issuance of %s must be rejected, got %v", sc, err)
		}
	}
}

// Every scope that moves or provisions money must sit behind the release
// control, not merely inside AllowedScopes. This is a classification test: it
// fails when a new money-touching scope is added to AllowedScopes and nobody
// decides whether it is gated.
//
// The omission it guards is silent and backwards. With the capability
// unreleased, an ungated application_settlements:write would let an ordinary
// Console key pay funds AWAY while it still could not take a payment.
func TestReleaseControl_UnreleasedRejectsEveryMoneyTouchingScope(t *testing.T) {
	s, _, ws := wsWithRoles(t) // unreleased
	pid := mkProject(t, s, "u_owner", ws)

	for _, sc := range []string{
		"wallet_accounts:create",        // opens a financial object under the bound owner
		"application_settlements:write", // moves money out to a beneficiary
	} {
		if _, _, err := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "k", []string{sc}, "", ""); err != ErrValidation {
			t.Errorf("unreleased: public issuance of %s must be rejected, got %v", sc, err)
		}
	}

	// The read counterpart stays issuable: it lists the caller's own accounts and
	// moves nothing, so gating it would cost something and buy nothing.
	if _, _, err := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "ro", []string{"wallet_accounts:read"}, "", ""); err != nil {
		t.Errorf("wallet_accounts:read must remain issuable while unreleased: %v", err)
	}
}

func TestReleaseControl_ReleasedAllowsPublicPaymentScopes(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	s.SetPaymentCapabilityReleased(true)
	pid := mkProject(t, s, "u_owner", ws)
	if _, _, err := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "k", []string{"payment_sessions:write"}, "", ""); err != nil {
		t.Fatalf("released: public payment scope must be issuable: %v", err)
	}
}

func TestReleaseControl_FixtureDisabledOutsideSandbox(t *testing.T) {
	// fixturesEnabled defaults false (hard-disabled outside sandbox, RT04D §2).
	s, _, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	if _, _, err := s.CreateFixtureAPIKey(bg, pid, "e2e", []string{"payment_sessions:write"}, "op", "", ""); err != ErrForbidden {
		t.Fatalf("fixture path must be hard-disabled when fixtures are off, got %v", err)
	}
}

func TestReleaseControl_FixtureKeyBypassesWhileUnreleased(t *testing.T) {
	s, st, ws := wsWithRoles(t) // unreleased
	s.SetFixturesEnabled(true)  // sandbox
	pid := mkProject(t, s, "u_owner", ws)

	key, secret, err := s.CreateFixtureAPIKey(bg, pid, "e2e", []string{"payment_sessions:write", "payment_links:write"}, "operator", "", "")
	if err != nil {
		t.Fatalf("operator fixture key with payment scopes must be issuable while unreleased: %v", err)
	}
	if secret == "" || key.ID == "" {
		t.Fatal("fixture key must return a reveal-once secret")
	}
	// The fixture key is authorizable for a payment scope (the controlled path).
	if _, err := s.AuthorizeKey(bg, secret, "payment_sessions:write"); err != nil {
		t.Fatalf("fixture key must authorize its payment scope: %v", err)
	}
	// Audited as a fixture (no raw secret).
	var fixture bool
	for _, ev := range st.Audits {
		if ev.Action == "apikey.fixture_created" {
			fixture = true
			if ev.Metadata["e2e_fixture"] != true {
				t.Error("fixture audit must flag e2e_fixture")
			}
		}
	}
	if !fixture {
		t.Error("fixture key must emit an apikey.fixture_created audit event")
	}
}

func TestReleaseControl_FixtureProjectSandboxGated(t *testing.T) {
	// Disabled outside sandbox (fixturesEnabled defaults false).
	s, _, _ := wsWithRoles(t)
	if _, _, err := s.CreateFixtureProject(bg, "Synthetic Platform", "op", "", ""); err != ErrForbidden {
		t.Fatalf("fixture-project must be hard-disabled when fixtures are off, got %v", err)
	}
	// Enabled in sandbox: mints a workspace + project usable by the fixture-key path.
	s.SetFixturesEnabled(true)
	ws, proj, err := s.CreateFixtureProject(bg, "Synthetic Platform", "operator", "", "")
	if err != nil {
		t.Fatalf("sandbox fixture-project must be creatable: %v", err)
	}
	if ws.ID == "" || proj.ID == "" || proj.Slug == "" {
		t.Fatal("fixture-project must return workspace + project ids and a slug")
	}
	// The project is immediately usable for a fixture key (no Console session).
	if _, secret, err := s.CreateFixtureAPIKey(bg, proj.ID, "e2e", []string{"payment_sessions:write"}, "operator", "", ""); err != nil || secret == "" {
		t.Fatalf("fixture-project must be usable by the fixture-key path: %v", err)
	}
	// Empty name rejected.
	if _, _, err := s.CreateFixtureProject(bg, "  ", "op", "", ""); err != ErrValidation {
		t.Errorf("empty name: want ErrValidation, got %v", err)
	}
}

func TestReleaseControl_FixtureKeyRevokeSandboxGated(t *testing.T) {
	// Disabled outside sandbox.
	s, _, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	if err := s.RevokeFixtureKey(bg, "k_any", "op", "", ""); err != ErrForbidden {
		t.Fatalf("fixture revoke must be hard-disabled when fixtures are off, got %v", err)
	}
	// Enabled in sandbox: mint → authorizes → revoke → rejected.
	s.SetFixturesEnabled(true)
	key, secret, err := s.CreateFixtureAPIKey(bg, pid, "e2e", []string{"payment_sessions:write"}, "op", "", "")
	if err != nil {
		t.Fatalf("fixture key must be issuable: %v", err)
	}
	if _, err := s.AuthorizeKey(bg, secret, "payment_sessions:write"); err != nil {
		t.Fatalf("active key must authorize: %v", err)
	}
	if err := s.RevokeFixtureKey(bg, key.ID, "op", "", ""); err != nil {
		t.Fatalf("fixture revoke must succeed: %v", err)
	}
	if _, err := s.AuthorizeKey(bg, secret, "payment_sessions:write"); err != ErrForbidden {
		t.Errorf("revoked key must be rejected: want ErrForbidden, got %v", err)
	}
	// Revoking an unknown key is NotFound; empty id is Validation.
	if err := s.RevokeFixtureKey(bg, "k_missing", "op", "", ""); err != ErrNotFound {
		t.Errorf("unknown key: want ErrNotFound, got %v", err)
	}
	if err := s.RevokeFixtureKey(bg, "  ", "op", "", ""); err != ErrValidation {
		t.Errorf("empty id: want ErrValidation, got %v", err)
	}
}

func TestReleaseControl_FixtureKeyRejectsUnknownProjectAndScope(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	s.SetFixturesEnabled(true)
	pid := mkProject(t, s, "u_owner", ws)
	if _, _, err := s.CreateFixtureAPIKey(bg, "p_missing", "e2e", []string{"payment_sessions:write"}, "op", "", ""); err != ErrNotFound {
		t.Errorf("unknown project: want ErrNotFound, got %v", err)
	}
	if _, _, err := s.CreateFixtureAPIKey(bg, pid, "e2e", []string{"not:a:scope"}, "op", "", ""); err != ErrValidation {
		t.Errorf("unknown scope: want ErrValidation, got %v", err)
	}
}
