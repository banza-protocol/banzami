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

func TestReleaseControl_ReleasedAllowsPublicPaymentScopes(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	s.SetPaymentCapabilityReleased(true)
	pid := mkProject(t, s, "u_owner", ws)
	if _, _, err := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "k", []string{"payment_sessions:write"}, "", ""); err != nil {
		t.Fatalf("released: public payment scope must be issuable: %v", err)
	}
}

func TestReleaseControl_FixtureKeyBypassesWhileUnreleased(t *testing.T) {
	s, st, ws := wsWithRoles(t) // unreleased
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

func TestReleaseControl_FixtureKeyRejectsUnknownProjectAndScope(t *testing.T) {
	s, _, ws := wsWithRoles(t)
	pid := mkProject(t, s, "u_owner", ws)
	if _, _, err := s.CreateFixtureAPIKey(bg, "p_missing", "e2e", []string{"payment_sessions:write"}, "op", "", ""); err != ErrNotFound {
		t.Errorf("unknown project: want ErrNotFound, got %v", err)
	}
	if _, _, err := s.CreateFixtureAPIKey(bg, pid, "e2e", []string{"not:a:scope"}, "op", "", ""); err != ErrValidation {
		t.Errorf("unknown scope: want ErrValidation, got %v", err)
	}
}
